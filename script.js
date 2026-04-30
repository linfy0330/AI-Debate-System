// --- 1. 配置與初始化 ---
const urlParams = new URLSearchParams(window.location.search);
const group = urlParams.get('group') || 'E'; // E=實驗組, C=控制組
let keyPool = {};
let chatLog = [];

// --- 2. 密碼解密邏輯 ---
window.onload = function() {
    // ⚠️ 請填入由加密工具產生的 Ciphertext
    const cipherText = "U2FsdGVkX18PBgnqmmUv2UmyIoppuERWv3NRLoWwEd4JkJvoV5YlwbEKCa5OROW6AO3mSWccmq+Pluw8DMfRCIhU2nuRhRH9m+ymM4VDY6hO+375vusr04ojFAZvJ7WIij1PxClE3kh73snLZIuQhUTkvb/CAIxaUHhcDBEj4UDNkN+vM6TIk8rBtyQL9mibRkAxTzwXyWfH9hiTznFKb6Lu4mfAv7AG9dr2ThddstW4vuZ4XB7BmVeeLn0u20ur9lW1d8/TnpmMaLRlRJDwG9BnSaIWybZBU5tcKoZT2+csPDisfbbTSIvX4+WdHlsUPzs6qW8UaL/9hSoUaNrE6GTbaqBaQrq0blP8C0saQSc9VKDvNqV9GONW/PcYjCEfDT45lzx7ke/IpqrwD1uVd7OG4OJCXn5BACUEzt0zWyOIjb6qjSDDek6WR49Fb8M0Nt0VlRho4t1uWiCdd40GY3KIjaRWh6URvocP8XnFOws="; 
    const userPassword = prompt("請輸入授權密碼：");
    
    try {
        const bytes = CryptoJS.AES.decrypt(cipherText, userPassword);
        const keys = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        
        // 8 把 Key 輪詢設定 (每池 2 把)
        keyPool = {
            'Order':    { keys: [keys[0], keys[1]], idx: 0 },
            'Guardian': { keys: [keys[2], keys[3]], idx: 0 },
            'Liberty':  { keys: [keys[4], keys[5]], idx: 0 },
            'Control':  { keys: [keys[6], keys[7]], idx: 0 }
        };
        
        document.getElementById('user-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
        document.getElementById('group-indicator').innerText = group === 'E' ? "測試模式：實驗組 (多代理人)" : "測試模式：控制組 (單一鏡像)";
    } catch (e) {
        alert("授權失敗！密碼錯誤或格式不正確。");
        location.reload();
    }
};

// --- 3. 呼叫 Gemini 3 Flash API (含自動重試與過濾) ---
async function callGemini(role, systemPrompt, userInput, retryCount = 0) {
    const pool = (group === 'E') ? keyPool[role] : keyPool['Control'];
    const apiKey = pool.keys[pool.idx];
    pool.idx = (pool.idx + 1) % pool.keys.length;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: `Instruction: ${systemPrompt}\nStudent: ${userInput}` }] }],
                safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" }],
                generationConfig: { temperature: 0.8, maxOutputTokens: 1000 }
            })
        });

        const data = await response.json();

        // 處理 503 伺服器忙碌：自動重試
        if (data.error && data.error.code === 503 && retryCount < 2) {
            await new Promise(res => setTimeout(res, 1500));
            return callGemini(role, systemPrompt, userInput, retryCount + 1);
        }

        if (data.error) return `[系統提示] 無法回覆：${data.error.message}`;
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        return "[系統提示] 網路連線異常。";
    }
}

// --- 4. 發送訊息與 UI 處理 ---
document.getElementById('send-btn').onclick = async () => {
    const input = document.getElementById('user-input').value.trim();
    if(!input) return;
    
    document.getElementById('user-input').value = '';
    document.getElementById('user-input').disabled = true;
    document.getElementById('send-btn').disabled = true;

    addMessage('student', `你：${input}`);
    chatLog.push({ role: 'Student', content: input });

    if (group === 'E') {
        const roles = ['Order', 'Guardian', 'Liberty'];
        const loadingDivs = roles.map(r => addMessage(`agent-${r.toLowerCase()}`, `[${r}] 思考中...`));

        const replies = await Promise.all(roles.map(r => 
            callGemini(r, agentPrompts[r.toLowerCase()], input)
        ));

        replies.forEach((fullReply, i) => {
            //修正後的隱藏邏輯：移除換行錯誤，並加強過濾效果
            const displayText = fullReply.split('{')[0].split('```')[0].trim();
            
            loadingDivs[i].innerText = `[${roles[i]}] ${displayText}`;
            chatLog.push({ role: roles[i], content: fullReply });
        });
    } else {
        const loadingDiv = addMessage('agent-mirror', "[AI] 思考中...");
        const fullReply = await callGemini('Control', agentPrompts.mirror, input);
        
        //這裡同樣也需要修正
        const displayText = fullReply.split('{')[0].split('```')[0].trim();
        
        loadingDiv.innerText = `[AI助手] ${displayText}`;
        chatLog.push({ role: 'Control', content: fullReply });
    }

    document.getElementById('user-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('user-input').focus();
};

// --- 5. 輔助功能 (訊息渲染與下載) ---
function addMessage(type, text) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerText = text;
    const container = document.getElementById('chat-container');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

document.getElementById('download-btn').onclick = () => {
    const content = chatLog.map(m => `[${m.role}]\n${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Log_${group}_${new Date().getTime()}.txt`;
    a.click();
};
