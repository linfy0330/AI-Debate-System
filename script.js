// --- 1. 基礎變數與參數設定 ---
const urlParams = new URLSearchParams(window.location.search);
const group = urlParams.get('group') || 'E'; // E=實驗組(3位AI), C=控制組(1位AI)
let keyPool = {};
let chatLog = [];

// --- 2. 系統啟動：密碼解密與 Key 初始化 ---
window.onload = function() {
    // ⚠️ 請在此處貼上你加密後的長字串
    const cipherText = "U2FsdGVkX18PBgnqmmUv2UmyIoppuERWv3NRLoWwEd4JkJvoV5YlwbEKCa5OROW6AO3mSWccmq+Pluw8DMfRCIhU2nuRhRH9m+ymM4VDY6hO+375vusr04ojFAZvJ7WIij1PxClE3kh73snLZIuQhUTkvb/CAIxaUHhcDBEj4UDNkN+vM6TIk8rBtyQL9mibRkAxTzwXyWfH9hiTznFKb6Lu4mfAv7AG9dr2ThddstW4vuZ4XB7BmVeeLn0u20ur9lW1d8/TnpmMaLRlRJDwG9BnSaIWybZBU5tcKoZT2+csPDisfbbTSIvX4+WdHlsUPzs6qW8UaL/9hSoUaNrE6GTbaqBaQrq0blP8C0saQSc9VKDvNqV9GONW/PcYjCEfDT45lzx7ke/IpqrwD1uVd7OG4OJCXn5BACUEzt0zWyOIjb6qjSDDek6WR49Fb8M0Nt0VlRho4t1uWiCdd40GY3KIjaRWh6URvocP8XnFOws="; 
    const userPassword = prompt("請輸入授權密碼：");
    
    try {
        // 使用 CryptoJS 進行 AES 解密
        const bytes = CryptoJS.AES.decrypt(cipherText, userPassword);
        const keys = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        
        // 分配 8 把 Key 到四個池子中，每池 2 把進行輪詢
        keyPool = {
            'Order':    { keys: [keys[0], keys[1]], idx: 0 },
            'Guardian': { keys: [keys[2], keys[3]], idx: 0 },
            'Liberty':  { keys: [keys[4], keys[5]], idx: 0 },
            'Control':  { keys: [keys[6], keys[7]], idx: 0 }
        };
        
        // 啟動介面
        document.getElementById('user-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
        document.getElementById('group-indicator').innerText = group === 'E' ? "模式：多智能體辯論 (實驗組)" : "模式：單一鏡像引導 (控制組)";
        console.log("系統初始化成功，準備連線至 Gemini 3 Flash Preview");
    } catch (e) {
        alert("授權失敗！請檢查密碼是否正確。");
        location.reload();
    }
};

// --- 3. 核心 API 呼叫函式 (含重試邏輯與斷句修正) ---
async function callGemini(role, systemPrompt, userInput, retryCount = 0) {
    // 根據角色與組別選取 Key 池
    const pool = (group === 'E') ? keyPool[role] : keyPool['Control'];
    const apiKey = pool.keys[pool.idx];
    pool.idx = (pool.idx + 1) % pool.keys.length; // 雙 Key 輪詢邏輯

    try {
        // 使用 v1beta 搭配 gemini-3-flash-preview
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ 
                    role: "user",
                    parts: [{ text: `系統任務：${systemPrompt}\n學生輸入：${userInput}` }] 
                }],
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ],
                generationConfig: { 
                    temperature: 0.8, 
                    maxOutputTokens: 1000 // 調高 Token 上限，解決句子斷掉的問題
                }
            })
        });

        const data = await response.json();

        // 處理 503 伺服器忙碌錯誤：自動重試機制
        if (data.error && data.error.code === 503 && retryCount < 2) {
            console.warn(`[${role}] 伺服器高負載，1.5秒後進行第 ${retryCount + 1} 次重試...`);
            await new Promise(res => setTimeout(res, 1500));
            return callGemini(role, systemPrompt, userInput, retryCount + 1);
        }

        if (data.error) return `[系統提示] 目前無法回應：${data.error.message}`;

        // 獲取內容並檢查是否完整
        const candidate = data.candidates[0];
        if (candidate.finishReason === "SAFETY") return "[此回覆內容因安全過濾被自動切斷]";
        
        return candidate.content.parts[0].text;

    } catch (error) {
        console.error(`連線異常 (${role}):`, error);
        return "[系統提示] 網路連線中斷，請檢查網路狀態。";
    }
}

// --- 4. 傳送按鈕點擊事件 ---
document.getElementById('send-btn').onclick = async () => {
    const input = document.getElementById('user-input').value.trim();
    if(!input) return;
    
    // 鎖定介面防止連按
    document.getElementById('user-input').value = '';
    document.getElementById('user-input').disabled = true;
    document.getElementById('send-btn').disabled = true;

    // 顯示學生發言
    addMessage('student', `你：${input}`);
    chatLog.push({ role: 'Student', content: input });

    if (group === 'E') {
        // 實驗組：三個 Agent 同時回應 (使用 Promise.all 提升效率)
        const roles = ['Order', 'Guardian', 'Liberty'];
        const loadingDivs = roles.map(r => addMessage(`agent-${r.toLowerCase()}`, `[${r}] 思考中...`));

        try {
            const replies = await Promise.all(roles.map(r => 
                callGemini(r, agentPrompts[r.toLowerCase()], input)
            ));

            replies.forEach((reply, i) => {
                loadingDivs[i].innerText = `[${roles[i]}] ${reply}`;
                chatLog.push({ role: roles[i], content: reply });
            });
        } catch (err) {
            console.error("多智能體處理發生錯誤", err);
        }
    } else {
        // 控制組：單一角色回應 (蘇格拉底鏡像模式)
        const loadingDiv = addMessage('agent-mirror', "[AI] 思考中...");
        const reply = await callGemini('Control', agentPrompts.mirror, input);
        loadingDiv.innerText = `[AI助手] ${reply}`;
        chatLog.push({ role: 'Control', content: reply });
    }

    // 恢復輸入
    document.getElementById('user-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('user-input').focus();
};

// --- 5. 輔助函式：介面更新與下載 ---
function addMessage(type, text) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerText = text;
    const container = document.getElementById('chat-container');
    container.appendChild(div);
    container.scrollTop = container.scrollHeight; // 自動捲動到底部
    return div;
}

// 下載對話紀錄功能
document.getElementById('download-btn').onclick = () => {
    const timestamp = new Date().toLocaleString();
    let content = `--- 實驗數據紀錄 ---\n時間：${timestamp}\n組別：${group}\n\n`;
    
    content += chatLog.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Student_Log_${group}_${new Date().getTime()}.txt`;
    a.click();
};