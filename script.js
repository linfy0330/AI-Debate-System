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
            indicator.classList.add('group-e-style');
        } else {
            indicator.classList.add('group-c-style');
        }

        setupStanceButtons();

    } catch (e) {
        alert("授權失敗！密碼錯誤或格式不正確。");
        location.reload();
    }
};

// --- 3. 立場按鈕處理邏輯 ---
function setupStanceButtons() {
    document.querySelectorAll('#welcome-overlay .stance-btn').forEach(btn => {
        btn.onclick = async () => {
            // 抓取按鈕內 <span> 的文字內容
            const studentThought = btn.querySelector('.speech-text').innerText.trim();
            
            // 1. 隱藏遮罩並啟用介面
            document.getElementById('welcome-overlay').style.display = 'none';
            document.getElementById('user-input').disabled = false;
            document.getElementById('send-btn').disabled = false;

            // 2. 顯示學生的「我覺得...」
            addMessage('student', `${studentThought}`);

            // 3. 標記為初始立場
            chatLog.push({ role: 'Student_Initial_Stance', content: studentThought });

            // 4. 將這句「我覺得...」直接傳送給 AI 觸發對話
            handleAIResponse(studentThought);
        };
    });
}

// --- 角色名稱與頭像對照表 ---
const roleInfo = {
    'agent-order': { name: '小明', avatar: '🧑‍🏫' },
    'agent-guardian': { name: '小花', avatar: '🌻' },
    'agent-liberty': { name: '阿傑', avatar: '🎸' },
    'agent-mirror': { name: '反思小助手', avatar: '🤖' }
};

// --- 4. 核心：處理 AI 回應的邏輯 (由按鈕或傳送鍵觸發) ---
async function handleAIResponse(input) {
    document.getElementById('user-input').disabled = true;
    document.getElementById('send-btn').disabled = true;

    if (group === 'E') {
        const roles = ['Order', 'Guardian', 'Liberty'];
        const loadingDivs = roles.map(r => addMessage(`agent-${r.toLowerCase()}`, `思考中...`));

        const replies = await Promise.all(roles.map(r => 
            callGemini(r, agentPrompts[r.toLowerCase()], input)
        ));

        replies.forEach((fullReply, i) => {
            const displayText = fullReply.split('{')[0].split('```')[0].trim();
            const cleanText = displayText.replace(/^\[.*?\]\s*/, '');
            
            const contentBox = loadingDivs[i].querySelector('.msg-content');
            if (contentBox) {
                contentBox.innerText = cleanText;
            } else {
                loadingDivs[i].innerText = cleanText;
            }
            
            chatLog.push({ role: roles[i], content: fullReply });
        });
    } else {
        const loadingDiv = addMessage('agent-mirror', "思考中...");
        const fullReply = await callGemini('Control', agentPrompts.mirror, input);
        const displayText = fullReply.split('{')[0].split('```')[0].trim();
        const cleanText = displayText.replace(/^\[.*?\]\s*/, '');
        
        const contentBox = loadingDiv.querySelector('.msg-content');
        if (contentBox) {
            contentBox.innerText = cleanText;
        } else {
            loadingDiv.innerText = cleanText;
        }
        
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
    addMessage('student', `${input}`);
    chatLog.push({ role: 'Student', content: input });

    // 呼叫統一的回應邏輯
    handleAIResponse(input);
};

// --- 6. 呼叫 Gemini 3 Flash API (保持原樣) ---
async function callGemini(role, systemPrompt, userInput, retryCount = 0) {
    const pool = (group === 'E') ? keyPool[role] : keyPool['Control'];
    const apiKey = pool.keys[pool.idx];
    pool.idx = (pool.idx + 1) % pool.keys.length;

    // 🏆 新增：抓取最近的 6 筆對話紀錄，作為上下文記憶
    // 使用 split('{')[0] 是為了過濾掉之前 AI 回傳的 JSON 紀錄，只保留純對話
    const recentHistory = chatLog.slice(-6).map(m => {
        let cleanText = m.content.split('{')[0].replace(/^\[.*?\]\s*/, '').trim();
        return `[${m.role}] 說: ${cleanText}`;
    }).join('\n');

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ 
                    role: "user", 
                    parts: [{ 
                        // 將上下文紀錄與學生的輸入一起包裝給 AI
                        text: `Instruction: ${systemPrompt}\n\n[最近的對話紀錄 (供你參考上下文)]\n${recentHistory}\n\n請根據上述歷史紀錄，以上述設定的角色做出回應：` 
                    }] 
                }],
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

// --- 7. 輔助功能 ---
function addMessage(type, text) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;

    const cleanText = text.replace(/^\[.*?\]\s*/, '');

    if (type === 'student') {
        div.innerHTML = `<div class="msg-content">${cleanText}</div>`;
    } else {
        const info = roleInfo[type] || { name: '系統', avatar: '💻' };
        div.innerHTML = `
            <div class="msg-header">
                <span class="avatar">${info.avatar}</span>
                <span class="name">${info.name}</span>
            </div>
            <div class="msg-content">${cleanText}</div>
        `;
    }

    const container = document.getElementById('chat-container');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

// --- 8. 結束與下載紀錄邏輯 ---
document.getElementById('download-btn').onclick = () => {
    document.getElementById('user-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    document.getElementById('final-stance-overlay').style.display = 'flex';
};

// 處理學生點擊「最終立場」按鈕的事件
document.querySelectorAll('#final-stance-overlay .final-btn').forEach(btn => {
    btn.onclick = () => {
        // 1. 抓取最終想法 (單純記錄)
        const finalThought = btn.querySelector('.speech-text').innerText.trim();
        
        // 2. 隱藏最終遮罩
        document.getElementById('final-stance-overlay').style.display = 'none';
        
        // 3. 記錄到 chatLog
        chatLog.push({ role: 'Student_Final_Stance', content: finalThought });
        
        // 4. 準備文字檔內容並觸發下載
        const content = chatLog.map(m => `[${m.role}]\n${m.content}`).join('\n\n---\n\n');
        const blob = new Blob([content], { type: 'text/plain' });
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Log_${group}_${new Date().getTime()}.txt`;
        document.body.appendChild(a); // 把 a 標籤加到畫面上 (防止某些瀏覽器阻擋下載)
        a.click();
        document.body.removeChild(a); // 點擊完移除
        
        // 5. 延遲 1.5 秒後跳轉到問卷表單
        setTimeout(() => {
            window.location.href = "https://forms.gle/XotheQyR3Y18JCJW8"; 
        }, 1500);
    };
});
