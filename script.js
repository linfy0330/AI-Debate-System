// --- 1. 配置與初始化 ---
const urlParams = new URLSearchParams(window.location.search);
const group = urlParams.get('group') || 'E'; // E=實驗組, C=控制組
let keyPool = {};
let chatLog = [];

// --- 2. 密碼解密邏輯 ---
window.onload = function() {
    const cipherText = "U2FsdGVkX18PBgnqmmUv2UmyIoppuERWv3NRLoWwEd4JkJvoV5YlwbEKCa5OROW6AO3mSWccmq+Pluw8DMfRCIhU2nuRhRH9m+ymM4VDY6hO+375vusr04ojFAZvJ7WIij1PxClE3kh73snLZIuQhUTkvb/CAIxaUHhcDBEj4UDNkN+vM6TIk8rBtyQL9mibRkAxTzwXyWfH9hiTznFKb6Lu4mfAv7AG9dr2ThddstW4vuZ4XB7BmVeeLn0u20ur9lW1d8/TnpmMaLRlRJDwG9BnSaIWybZBU5tcKoZT2+csPDisfbbTSIvX4+WdHlsUPzs6qW8UaL/9hSoUaNrE6GTbaqBaQrq0blP8C0saQSc9VKDvNqV9GONW/PcYjCEfDT45lzx7ke/IpqrwD1uVd7OG4OJCXn5BACUEzt0zWyOIjb6qjSDDek6WR49Fb8M0Nt0VlRho4t1uWiCdd40GY3KIjaRWh6URvocP8XnFOws="; 
    const userPassword = prompt("請輸入授權密碼：");
    
    try {
        const bytes = CryptoJS.AES.decrypt(cipherText, userPassword);
        const keys = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        
        keyPool = {
            'Order':    { keys: [keys[0], keys[1]], idx: 0 },
            'Guardian': { keys: [keys[2], keys[3]], idx: 0 },
            'Liberty':  { keys: [keys[4], keys[5]], idx: 0 },
            'Control':  { keys: [keys[6], keys[7]], idx: 0 }
        };
        
        document.getElementById('welcome-overlay').style.display = 'flex';
        //document.getElementById('group-indicator').innerText = group === 'E' ? "測試模式：實驗組 (多代理人)" : "測試模式：控制組 (單一鏡像)";
        const indicator = document.getElementById('group-indicator');

        if (group === 'E') {
            // 實驗組：套用藍色色塊，不顯示文字
            indicator.classList.add('group-e-style');
        } else {
            // 控制組：套用灰色色塊，不顯示文字
            indicator.classList.add('group-c-style');
        }

        setupStanceButtons();

    } catch (e) {
        alert("授權失敗！密碼錯誤或格式不正確。");
        location.reload();
    }
};

// --- 3. 新增：立場按鈕處理邏輯 ---
function setupStanceButtons() {
    document.querySelectorAll('.stance-btn').forEach(btn => {
        btn.onclick = async () => {
            // 抓取按鈕內 <span class="speech-text"> 的文字內容
            const studentThought = btn.querySelector('.speech-text').innerText.trim();
            
            // 1. 隱藏遮罩並啟用介面
            document.getElementById('welcome-overlay').style.display = 'none';
            document.getElementById('user-input').disabled = false;
            document.getElementById('send-btn').disabled = false;

            // 2. 顯示學生的「我覺得...」
            addMessage('student', `你：${studentThought}`);
            
            // 3. 標記為初始立場，這對於分析 RQ4（立場修正幅度）至關重要 [cite: 34, 60]
            chatLog.push({ role: 'Student_Initial_Stance', content: studentThought });

            // 4. 將這句「我覺得...」直接傳送給 AI 觸發對話
            handleAIResponse(studentThought);
        };
    });
}

// --- 4. 核心：處理 AI 回應的邏輯 (由按鈕或傳送鍵觸發) ---
async function handleAIResponse(input) {
    // 禁用輸入，避免 AI 回傳時學生重複傳送
    document.getElementById('user-input').disabled = true;
    document.getElementById('send-btn').disabled = true;

    if (group === 'E') {
        const roles = ['Order', 'Guardian', 'Liberty'];
        const loadingDivs = roles.map(r => addMessage(`agent-${r.toLowerCase()}`, `[${r}] 思考中...`));

        const replies = await Promise.all(roles.map(r => 
            callGemini(r, agentPrompts[r.toLowerCase()], input)
        ));

        replies.forEach((fullReply, i) => {
            const displayText = fullReply.split('{')[0].split('```')[0].trim();
            loadingDivs[i].innerText = `[${roles[i]}] ${displayText}`;
            chatLog.push({ role: roles[i], content: fullReply });
        });
    } else {
        const loadingDiv = addMessage('agent-mirror', "[AI] 思考中...");
        const fullReply = await callGemini('Control', agentPrompts.mirror, input);
        const displayText = fullReply.split('{')[0].split('```')[0].trim();
        
        loadingDiv.innerText = `[AI助手] ${displayText}`;
        chatLog.push({ role: 'Control', content: fullReply });
    }

    // 回應結束，恢復輸入功能 
    document.getElementById('user-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('user-input').focus();
}

// --- 5. 傳送按鈕點擊處理 ---
document.getElementById('send-btn').onclick = async () => {
    const input = document.getElementById('user-input').value.trim();
    if(!input) return;
    
    document.getElementById('user-input').value = '';
    addMessage('student', `你：${input}`);
    chatLog.push({ role: 'Student', content: input });

    // 呼叫統一的回應邏輯
    handleAIResponse(input);
};

// --- 6. 呼叫 Gemini 3 Flash API (保持原樣) ---
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

// --- 7. 輔助功能 (保持原樣) ---
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
