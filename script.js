// --- 1. 配置與初始化 ---
const urlParams = new URLSearchParams(window.location.search);
const group = urlParams.get('group') || 'E'; // E=實驗組, C=控制組
let keyPool = {};
let chatLog = [];
let currentRound = 0;

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

        setupStanceSliders();

    } catch (e) {
        alert("授權失敗！密碼錯誤或格式不正確。");
        location.reload();
    }
};

// --- 3. 立場按鈕處理邏輯 ---
const stanceMap = {
    "-3": "強烈支持完全自主",
    "-2": "支持完全自主",
    "-1": "稍微偏向完全自主",
    "0": "中立 / 有限度開放",
    "1": "稍微偏向完全禁止",
    "2": "支持完全禁止",
    "3": "強烈支持完全禁止"
};

function setupStanceSliders() {
    const initialStanceSlider = document.getElementById('initial-stance');
    const initialStanceText = document.getElementById('initial-stance-text');
    const initialConfSlider = document.getElementById('initial-confidence');
    const initialConfText = document.getElementById('initial-conf-text');

    // 動態更新文字
    if (initialStanceSlider) {
        initialStanceSlider.addEventListener('input', (e) => {
            initialStanceText.innerText = `${stanceMap[e.target.value]} (${e.target.value})`;
        });
    }

    if (initialConfSlider) {
        initialConfSlider.addEventListener('input', (e) => {
            initialConfText.innerText = `${e.target.value}%`;
        });
    }

    // 開始討論按鈕
    const startBtn = document.getElementById('start-chat-btn');
    if (startBtn) {
        startBtn.onclick = async () => {
            const stanceVal = initialStanceSlider.value;
            const confVal = initialConfSlider.value;
            const studentThought = `我的初始立場是：【${stanceMap[stanceVal]}】(傾向分數：${stanceVal})，我的信心程度是 ${confVal}%。`;
            
            // 1. 隱藏遮罩並啟用介面
            document.getElementById('welcome-overlay').style.display = 'none';
            document.getElementById('user-input').disabled = false;
            document.getElementById('send-btn').disabled = false;

            // 2. 顯示學生的初始狀態
            addMessage('student', `${studentThought}`);

            // 3. 標記為初始立場
            chatLog.push({ role: 'Student_Initial_Stance', content: studentThought, stance: stanceVal, confidence: confVal });

            // 4. 將這句話傳送給 AI 觸發第一輪對話
            handleAIResponse(studentThought);
        };
    }
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

        // 🌟 防超額限制：加入亂數與順序延遲 (錯開 API 請求)
        const replies = await Promise.all(roles.map(async (r, index) => {
            const delay = Math.floor(Math.random() * 1000) + (index * 800); // 依序延遲
            await new Promise(res => setTimeout(res, delay));
            return callGemini(r, agentPrompts[r.toLowerCase()], input);
        }));

        replies.forEach((fullReply, i) => {
            const displayText = fullReply.split('{')[0].split('```')[0].trim();
            // ... (其餘原本邏輯保持不變)
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

    currentRound++; // 🌟 學生成功送出訊息，對話輪數 +1
    console.log(`目前進入第 ${currentRound} 輪對話`); 

    // 🌟 新增：不顯示提示，默默檢查是否滿 10 輪，滿了就解鎖「結束」按鈕
    if (currentRound >= 10) {
        document.getElementById('download-btn').disabled = false;
    }

    document.getElementById('user-input').value = '';
    addMessage('student', `${input}`);
    chatLog.push({ role: 'Student', content: input });

    // 呼叫統一的回應邏輯
    handleAIResponse(input);
};

// --- 6. 呼叫 Gemini 3 Flash API ---
async function callGemini(role, systemPrompt, userInput, retryCount = 0) {
    const pool = (group === 'E') ? keyPool[role] : keyPool['Control'];
    const apiKey = pool.keys[pool.idx];
    pool.idx = (pool.idx + 1) % pool.keys.length;

    // 🏆 新增：抓取最近的 6 筆對話紀錄，作為上下文記憶
    const recentHistory = chatLog.slice(-6).map(m => {
        let cleanText = m.content.split('{')[0].replace(/^\[.*?\]\s*/, '').trim();
        return `[${m.role}] 說: ${cleanText}`;
    }).join('\n');

    // 🌟 新增：動態提示詞注入 (AI 主動說服與施壓機制)
    let dynamicPrompt = systemPrompt;
    
    // 只有實驗組 (E) 需要發動說服，控制組 (鏡像) 維持中立不變
    if (group === 'E' && currentRound >= 5) {
        dynamicPrompt += `
        
        [隱藏動態指令：主動說服學生]
        注意！對話已經進行了 ${currentRound} 輪，現在進入「深度說服階段」。
        請不要再只是被動防守或單純反駁，你要開始『主動且強勢地說服學生』改變想法！
        請運用你角色的核心特質（例如小明的權威與規定、小花的強烈擔憂、或阿傑的極端嘲諷），針對學生剛才的論點弱點進行強力的追問，或拋出一個「如果發生最壞情況怎麼辦？」的震撼性情境。
        你的目標是：試圖讓學生產生動搖、懷疑自己的立場，並在最終裁決時倒戈加入你的陣營。請保持角色口吻，自然地加強你的攻擊力道！`;
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ 
                    role: "user", 
                    parts: [{ 
                        // 🌟 這裡把原本的 systemPrompt 換成加工過的 dynamicPrompt
                        text: `Instruction: ${dynamicPrompt}\n\n[最近的對話紀錄 (供你參考上下文)]\n${recentHistory}\n\n請根據上述歷史紀錄，以上述設定的角色做出回應：` 
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
        // 🌟 防呆補強：附上假的 JSON 結構，確保前面的 .split('{')[0] 不會壞掉，
        // 且能在後台資料中清楚識別出斷線事件。
        return "[系統提示] 網路連線異常，請檢查網路。 {\"claim\": \"Error\", \"reason\": \"Network\", \"example\": \"N/A\", \"response\": \"Error\", \"bias_used\": false, \"conflict_level\": \"None\"}";
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

const closeFinalOverlayBtn = document.getElementById('close-final-overlay');
if (closeFinalOverlayBtn) {
    closeFinalOverlayBtn.onclick = () => {
        // 隱藏遮罩
        document.getElementById('final-stance-overlay').style.display = 'none';
        // 重新解鎖輸入框與傳送按鈕
        document.getElementById('user-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
    };
}

const finalStanceSlider = document.getElementById('final-stance');
const finalStanceText = document.getElementById('final-stance-text');
const finalConfSlider = document.getElementById('final-confidence');
const finalConfText = document.getElementById('final-conf-text');

if (finalStanceSlider) {
    finalStanceSlider.addEventListener('input', (e) => {
        finalStanceText.innerText = `${stanceMap[e.target.value]} (${e.target.value})`;
    });
}
if (finalConfSlider) {
    finalConfSlider.addEventListener('input', (e) => {
        finalConfText.innerText = `${e.target.value}%`;
    });
}

const submitFinalBtn = document.getElementById('submit-final-btn');
if (submitFinalBtn) {
    submitFinalBtn.onclick = () => {
        const finalStanceVal = finalStanceSlider.value;
        const finalConfVal = finalConfSlider.value;
        const finalThought = `我的最終裁決是：【${stanceMap[finalStanceVal]}】(分數：${finalStanceVal})，信心程度：${finalConfVal}%。`;
        
        // 1. 隱藏最終遮罩
        document.getElementById('final-stance-overlay').style.display = 'none';
        
        // 2. 記錄到 chatLog
        chatLog.push({ role: 'Student_Final_Stance', content: finalThought, stance: finalStanceVal, confidence: finalConfVal });
        
        // 3. 準備文字檔內容並觸發下載
        // 🌟 直接使用全域變數 currentRound 來記錄輪數
        const headerInfo = `【實驗紀錄摘要】\n總對談輪數：${currentRound} 輪\n==============================\n\n`;
        const chatContent = chatLog.map(m => `[${m.role}]\n${m.content}`).join('\n\n---\n\n');
        const finalContent = headerInfo + chatContent;
        
        const blob = new Blob([finalContent], { type: 'text/plain' });
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Log_${group}_${new Date().getTime()}.txt`;
        document.body.appendChild(a); 
        a.click();
        document.body.removeChild(a); 
        
    };
}
