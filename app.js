document.addEventListener('DOMContentLoaded', () => {
    window.onerror = function (msg, url, line, col, error) {
        const errDiv = document.createElement('div');
        errDiv.style.position = 'fixed';
        errDiv.style.top = '0';
        errDiv.style.left = '0';
        errDiv.style.background = 'red';
        errDiv.style.color = 'white';
        errDiv.style.padding = '20px';
        errDiv.style.zIndex = '9999';
        errDiv.innerHTML = `<h3>⚠️ 에러 발생! 이 화면을 캡쳐해서 지니봇에게 보여주세요.</h3><p>${msg}</p><p>Line: ${line}</p><pre>${error ? error.stack : ''}</pre>`;
        document.body.appendChild(errDiv);
        return false;
    };

    // --- State Persistence Managers (FIREBASE) ---
    // Wait for Firebase to initialize from index.html module script
    let db, fbRef, fbSet, fbOnValue, fbGet;

    // We poll until Firebase globals are ready. In production, a bundler/module approach is cleaner.
    const checkFirebase = setInterval(() => {
        if (window.firebaseDB) {
            clearInterval(checkFirebase);
            db = window.firebaseDB;
            fbRef = window.fbRef;
            fbSet = window.fbSet;
            fbOnValue = window.fbOnValue;
            fbGet = window.fbGet;
            initApp();
        }
    }, 50);

    const defaultEmployees = [
        { id: 1, name: '지니', team: 'HQ팀', isParticipating: true, isNewHire: false, buddyId: null },
        { id: 2, name: '만두', team: '개발본부', isParticipating: true, isNewHire: false, buddyId: null },
        { id: 3, name: '페이지', team: '프로덕트본부', isParticipating: true, isNewHire: false, buddyId: null },
        { id: 4, name: '로이드', team: '디자인팀', isParticipating: true, isNewHire: false, buddyId: null },
        { id: 5, name: '제이더', team: '개발본부', isParticipating: true, isNewHire: false, buddyId: null },
        { id: 6, name: '루카스', team: '개발본부', isParticipating: false, isNewHire: false, buddyId: null },
        { id: 7, name: '지크', team: '개발본부', isParticipating: true, isNewHire: false, buddyId: null },
        { id: 8, name: '마크', team: '마케팅팀', isParticipating: true, isNewHire: false, buddyId: null },
        { id: 9, name: '소피', team: '영업팀', isParticipating: true, isNewHire: true, buddyId: 8 },
        { id: 10, name: '올리비아', team: '데이터팀', isParticipating: true, isNewHire: false, buddyId: null },
    ];

    let employees = defaultEmployees;
    let groups = []; // Active draft
    let matchHistory = [];
    let customRules = [
        ['HQ팀', '튜터팀', 'CS파트'],
        ['오리지널팀', '커뮤니티스쿼드'],
        ['클래스팀', '콘텐츠팀', '부동산팀'],
        ['프롭테크팀', '프롭테크/클래스스쿼드']
    ];
    let savedDateLabel = "2024-XX-XX (X주차)";
    let currentUser = null;
    let slackWebhookUrl = "";

    function saveEmployees() {
        fbSet(fbRef(db, 'employees'), employees);
    }

    function saveDraft(currentGroups) {
        groups = currentGroups || [];
        fbSet(fbRef(db, 'draft'), groups);
    }

    function clearDraft() {
        groups = [];
        fbSet(fbRef(db, 'draft'), []);
    }

    function saveDate(dateStr) {
        fbSet(fbRef(db, 'dateLabel'), dateStr);
    }

    // Team Colors Map
    const teamColors = {
        '개발본부': { bg: '#DBEAFE', text: '#1D4ED8' },
        'HQ팀': { bg: '#FEE2E2', text: '#B91C1C' },
        '프로덕트본부': { bg: '#D1FAE5', text: '#047857' },
        '디자인팀': { bg: '#FEF3C7', text: '#B45309' },
        '마케팅팀': { bg: '#E0E7FF', text: '#4338CA' },
        '영업팀': { bg: '#FCE7F3', text: '#BE185D' },
        '데이터팀': { bg: '#F3E8FF', text: '#7E22CE' },
        '튜터팀': { bg: '#FFE4E6', text: '#E11D48' },
        'CS파트': { bg: '#FFEDD5', text: '#C2410C' },
        '오리지널팀': { bg: '#DCFCE7', text: '#15803D' },
        '커뮤니티스쿼드': { bg: '#CFFAFE', text: '#0E7490' },
        '클래스팀': { bg: '#E0F2FE', text: '#0369A1' },
        '콘텐츠팀': { bg: '#EDE9FE', text: '#6D28D9' },
        '부동산팀': { bg: '#FAE8FF', text: '#A21CAF' },
        '프롭테크팀': { bg: '#F1F5F9', text: '#334155' },
        '프롭테크/클래스스쿼드': { bg: '#E2E8F0', text: '#0F172A' }
    };
    function getTeamColor(team) { return teamColors[team] || { bg: '#F3F4F6', text: '#4B5563' }; }

    // --- DOM Elements ---
    const views = { login: document.getElementById('login-view'), admin: document.getElementById('admin-view'), loading: document.createElement('div') };

    // Add a simple loading overlay while Firebase fetches initial state
    views.loading.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; display:flex; justify-content:center; align-items:center; z-index:9999; font-size:1.5rem; color:#4B5563;";
    views.loading.innerText = "서버와 연결 중입니다...";
    document.body.appendChild(views.loading);

    const loginBtns = { btn: document.getElementById('login-btn'), input: document.getElementById('nickname'), error: document.getElementById('login-error') };
    const nav = { greeting: document.getElementById('user-greeting'), logout: document.getElementById('logout-btn'), tabs: document.getElementById('admin-tabs') };
    const headers = { admin: document.getElementById('admin-match-header'), user: document.getElementById('user-match-header') };
    const userBox = { status: document.getElementById('participation-status-box'), toggleBtn: document.getElementById('toggle-participation-btn') };

    const adminDateInput = document.getElementById('admin-date-input');
    const matching = {
        runBtn: document.getElementById('run-matching-btn'),
        resultsCount: document.getElementById('active-emp-count'),
        container: document.getElementById('matching-results'),
        weekLabel: document.getElementById('current-week-label'),
        useMarchRule: document.getElementById('use-march-rule'),
        addEmptyGroupBtn: document.getElementById('add-empty-group-btn')
    };

    if (matching.addEmptyGroupBtn) {
        matching.addEmptyGroupBtn.addEventListener('click', () => {
            groups.push([]);
            renderGroups(groups, matching.weekLabel.textContent, true);
        });
    }

    const empManager = {
        list: document.getElementById('employee-list'),
        name: document.getElementById('new-emp-name'),
        team: document.getElementById('new-emp-team'),
        newHire: document.getElementById('new-emp-newhire'),
        buddySelect: document.getElementById('new-emp-buddy'),
        addBtn: document.getElementById('add-emp-btn'),
        bulkInput: document.getElementById('bulk-emp-input'),
        bulkAddBtn: document.getElementById('bulk-add-btn')
    };

    const rulesManager = {
        container: document.getElementById('rules-container'),
        addBtn: document.getElementById('add-rule-bucket-btn'),
        saveBtn: document.getElementById('save-rules-btn')
    };

    const historyManager = {
        saveBtn: document.getElementById('save-history-btn'),
        clearBtn: document.getElementById('clear-history-btn'),
        list: document.getElementById('history-list')
    };

    adminDateInput.addEventListener('input', (e) => {
        matching.weekLabel.textContent = e.target.value;
        saveDate(e.target.value);
    });

    // --- Initialization & Realtime Listeners ---
    function initApp() {

        // 1. Listen for Date Label
        fbOnValue(fbRef(db, 'dateLabel'), (snapshot) => {
            const val = snapshot.val();
            if (val) {
                savedDateLabel = val;
                adminDateInput.value = savedDateLabel;
                matching.weekLabel.textContent = savedDateLabel;
            }
        });

        let lastParticipatingCount = -1;
        fbOnValue(fbRef(db, 'employees'), (snapshot) => {
            const val = snapshot.val();
            let changedCount = false;
            
            if (val) {
                employees = val;
                if (currentUser) {
                    const updatedMe = employees.find(e => e.name === currentUser.name);
                    if (updatedMe) currentUser.isParticipating = updatedMe.isParticipating;
                }
            } else {
                fbSet(fbRef(db, 'employees'), defaultEmployees);
                employees = defaultEmployees;
            }
            
            const newCount = employees.filter(e => e.isParticipating).length;
            if (lastParticipatingCount !== -1 && lastParticipatingCount !== newCount) {
                changedCount = true;
            }
            lastParticipatingCount = newCount;

            renderEmployeeList();
            renderBuddyOptions();
            updateEmpCount();
            if (currentUser) renderUserParticipationStatus();

            // Auto-trigger advanced matching if admin is viewing an active draft and attendance changed!
            if (changedCount && currentUser && currentUser.name === '지니') {
                if (groups && groups.length > 0) {
                    console.log('Attendance count changed, auto-regenerating matching...');
                    // Add slight delay to avoid blocking render
                    setTimeout(() => generateAdvancedGroups(), 100);
                }
            }
        });

        // 3. Listen for History changes
        fbOnValue(fbRef(db, 'history'), (snapshot) => {
            matchHistory = snapshot.val() || [];
            renderHistoryList();
            if (currentUser && currentUser.name !== '지니' && (!groups || groups.length === 0)) {
                // Trigger a re-render for regular users if history changes and no draft exists
                showDashboard();
            }
        });

        // 4. Listen for Rules changes
        fbOnValue(fbRef(db, 'rules'), (snapshot) => {
            const val = snapshot.val();
            if (val) {
                customRules = val;
            }
            renderRulesList();
        });

        // 5. Listen for Draft changes (Live Preview Sync!)
        fbOnValue(fbRef(db, 'draft'), (snapshot) => {
            groups = snapshot.val() || [];
            if (currentUser) {
                if (currentUser.name === '지니') {
                    renderGroups(groups, matching.weekLabel.textContent, true);
                } else {
                    showDashboard(); // Re-evaluates what to show
                }
            }
        });

        // 6. Listen for Slack Webhook changes
        fbOnValue(fbRef(db, 'slackWebhook'), (snapshot) => {
            slackWebhookUrl = snapshot.val() || "";
            const slackInput = document.getElementById('slack-webhook-input');
            if (slackInput) {
                slackInput.value = slackWebhookUrl;
            }
        });

        // Hide loading screen after a short delay assuming first fetches return
        setTimeout(() => {
            views.loading.style.display = 'none';
        }, 800);
    }

    // --- Slack Integration & Text/Excel/Image Copy ---
    
    function getCurrentTimeStr() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }

    function createTempTableForScreenshot(groups, weekStr) {
        const tableDiv = document.createElement('div');
        tableDiv.style.position = 'absolute';
        tableDiv.style.left = '-9999px';
        tableDiv.style.top = '-9999px';
        tableDiv.style.background = '#FFFFFF';
        tableDiv.style.padding = '30px';
        tableDiv.style.width = '1500px'; 
        tableDiv.style.fontFamily = "'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif";
        tableDiv.style.boxSizing = 'border-box';
        
        let tableHtml = `
        <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 32px; text-align: center; letter-spacing: -0.5px;">🍲 ${weekStr} 랜덤 런치 조 편성 표</h2>
        <table style="width: 100%; border-collapse: collapse; border: 2px solid #374151;">
        <tbody>`;
        
        const cols = 5; // 5 columns makes it wider, shorter vertically!
        let groupIdx = 0;
        for (let i = 0; i < groups.length; i += cols) {
            tableHtml += `<tr>`;
            for (let j = 0; j < cols; j++) {
                if (groupIdx < groups.length) {
                    let g = groups[groupIdx];
                    let isBuddyGroup = g.some(emp => emp.buddyId && g.some(b => b.id === emp.buddyId));
                    let badge = isBuddyGroup ? `<span style="color:#D97706; font-size:14px; margin-left:4px; font-weight: 700;">(🤝버디)</span>` : "";
                    
                    let memberStr = g.map(e => {
                        let tag = e.isNewHire ? '🐥' : '';
                        return `<span style="display:inline-block; padding:4px 8px; background:#F1F5F9; border-radius:6px; margin:2px 4px 2px 0; font-weight: 600; color: #334155; font-size: 16px; border: 1px solid #E2E8F0;">${e.name}${tag}</span>`;
                    }).join('');
                    
                    tableHtml += `
                    <td style="border: 1px solid #CBD5E1; padding: 14px 16px; vertical-align: top; width: 20%;">
                        <div style="font-weight: 800; margin-bottom: 10px; color: #0F172A; font-size: 18px; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                            <span>조 ${groupIdx+1}</span>
                            ${badge}
                        </div>
                        <div style="line-height: 1.5;">${memberStr}</div>
                    </td>`;
                } else {
                    tableHtml += `<td style="border: 1px solid #CBD5E1; padding: 14px 16px; width: 20%; background: #F8FAFC;"></td>`;
                }
                groupIdx++;
            }
            tableHtml += `</tr>`;
        }
        
        tableHtml += `</tbody></table>`;
        tableDiv.innerHTML = tableHtml;
        document.body.appendChild(tableDiv);
        return tableDiv;
    }

    // 0. Image Copy (Table Format)
    const copyImageBtn = document.getElementById('copy-image-btn');
    if (copyImageBtn) {
        copyImageBtn.addEventListener('click', async () => {
            if (!groups || groups.length === 0) return alert('복사할 매칭 결과가 없습니다.');
            
            copyImageBtn.textContent = '찍는 중... 📸';
            copyImageBtn.disabled = true;

            try {
                if (typeof html2canvas === 'undefined') throw new Error('html2canvas library not loaded');
                
                const dateStr = matching.weekLabel ? matching.weekLabel.textContent : '이번 주';
                const tableDiv = createTempTableForScreenshot(groups, dateStr);
                
                const canvas = await html2canvas(tableDiv, {
                    scale: 2, 
                    backgroundColor: '#FFFFFF', 
                    useCORS: true 
                });
                
                document.body.removeChild(tableDiv);

                canvas.toBlob(async (blob) => {
                    if (!blob) throw new Error('Blob generation failed');
                    try {
                        const item = new ClipboardItem({ "image/png": blob });
                        await navigator.clipboard.write([item]);
                        alert('📸 예쁜 표 형태의 이미지가 클립보드에 복사되었습니다!\n슬랙 대화창에 가셔서 Ctrl+V (붙여넣기) 하시면 완성입니다. ✨');
                    } catch (clipErr) {
                        console.error('Clipboard write error:', clipErr);
                        alert('브라우저 권한 문제로 클립보드에 바로 복사할 수 없습니다. 대신 우클릭하여 직접 복사/저장해주세요.');
                        // Fallback
                        const img = document.createElement('img');
                        img.src = URL.createObjectURL(blob);
                        img.className = 'glass';
                        img.style.cssText = 'position:fixed; top:10%; left:50%; transform:translateX(-50%); max-width:80%; max-height:80%; z-index:99999; cursor:zoom-out; border: 4px solid white; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); border-radius: 12px;';
                        img.onclick = () => document.body.removeChild(img);
                        const hint = document.createElement('div');
                        hint.innerHTML = '<b style="font-size:1.2rem; color:red;">[우클릭 -> 이미지 복사]</b> 후 아무 곳이나 클릭해 닫아주세요.';
                        hint.style.cssText = 'position:absolute; top:-30px; left:0; width:100%; text-align:center; color:#1F2937;';
                        img.appendChild(hint);
                        document.body.appendChild(img);
                    } finally {
                        copyImageBtn.textContent = '📸 깔끔한 "표(테이블) 이미지"로 복사';
                        copyImageBtn.disabled = false;
                    }
                }, "image/png", 1.0);

            } catch (err) {
                console.error(err);
                alert('이미지 캡쳐 중 오류가 발생했습니다 ㅠㅠ');
                copyImageBtn.textContent = '📸 깔끔한 "표(테이블) 이미지"로 복사';
                copyImageBtn.disabled = false;
            }
        });
    }


    // 2. Send Slack Text directly
    const saveSlackBtn = document.getElementById('save-slack-btn');
    const slackWebhookInput = document.getElementById('slack-webhook-input');
    if (saveSlackBtn && slackWebhookInput) {
        saveSlackBtn.addEventListener('click', () => {
            const token = slackWebhookInput.value.trim();
            fbSet(fbRef(db, 'slackWebhook'), token);
            document.getElementById('slack-save-msg').style.display = 'block';
            setTimeout(() => document.getElementById('slack-save-msg').style.display = 'none', 3000);
        });
    }

    const sendSlackBtn = document.getElementById('send-slack-btn');
    if (sendSlackBtn) {
        sendSlackBtn.addEventListener('click', async () => {
            const threadLinkInput = document.getElementById('slack-thread-link');
            const threadUrl = threadLinkInput ? threadLinkInput.value.trim() : '';
            
            if (!groups || groups.length === 0) return alert('보낼 매칭 결과가 없습니다.');
            if (!slackWebhookUrl || !slackWebhookUrl.startsWith('xoxb-')) {
                return alert('슬랙 봇(Bot) 토큰 설정이 안되어 있거나 올바르지 않습니다. [매칭 규칙 관리] 탭 하단에서 xoxb- 로 시작하는 토큰을 저장해주세요.');
            }
            if (!threadUrl) {
                return alert('알림을 보낼 "슬랙 메시지 링크"를 상단 입력칸에 붙여넣어주세요!');
            }

            const match = threadUrl.match(/\/archives\/([A-Z0-9]+)\/p(\d+)/);
            if (!match) {
                return alert('올바른 슬랙 메시지 링크가 아닙니다. 해당 스레드 메시지의 [링크 복사] 기능으로 정확하게 가져와주세요.');
            }
            
            const channelId = match[1];
            const rawTs = match[2];
            const threadTs = rawTs.slice(0, Math.max(0, rawTs.length - 6)) + '.' + rawTs.slice(-6);

            if (!confirm('현재 매칭 결과를 슬랙 스레드에 깔끔한 "표 이미지" 형태로 즉시 쏘시겠습니까?')) return;

            sendSlackBtn.textContent = '스레드로 쏘는 중... 🚀';
            sendSlackBtn.disabled = true;

            try {
                if (typeof html2canvas === 'undefined') throw new Error('html2canvas library not loaded');

                const dateStr = matching.weekLabel ? matching.weekLabel.textContent : '이번 주';
                const tableDiv = createTempTableForScreenshot(groups, dateStr);

                const canvas = await html2canvas(tableDiv, {
                    scale: 2,
                    backgroundColor: '#FFFFFF',
                    useCORS: true
                });

                document.body.removeChild(tableDiv);
                
                // Base64 이미지를 가져와 Vercel 백엔드로 전송
                const imageBase64 = canvas.toDataURL("image/png");

                // Vercel Serverless Function 호출 (CORS 우회 및 이미지 첨부 지원)
                const response = await fetch('/api/slack', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: slackWebhookUrl,
                        channel: channelId,
                        thread_ts: threadTs,
                        text: `🍙 랜덤 런치 조 편성 표 안내드립니다. 확인해 주세요! (${getCurrentTimeStr()} 기준 반영 완료)`,
                        imageBase64: imageBase64
                    })
                });

                const data = await response.json();
                if (data.success) {
                    alert('🎉 슬랙 지정하신 스레드로 깔끔한 "표 이미지" 전송이 완료되었습니다!');
                    if (threadLinkInput) threadLinkInput.value = ''; // clear input on success
                } else {
                    console.error('Slack API Error:', data);
                    alert(`슬랙 전송 실패: ${data.error}\n(우리가 만든 슬랙 앱이 해당 채널에 추가되어 있는지 꼭 확인해 주세요!)`);
                }
            } catch (error) {
                console.error('Slack network error:', error);
                alert('안전한 전송을 위한 서버와 연결 중 오류가 발생했습니다. (Vercel 배포 완료 시 정상 작동합니다.)');
            } finally {
                sendSlackBtn.textContent = '🚀 지정 스레드로 "표(테이블) 이미지" 1초만에 전송!';
                sendSlackBtn.disabled = false;
            }
        });
    }




    // --- Authentication ---
    loginBtns.btn.addEventListener('click', handleLogin);
    loginBtns.input.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
    nav.logout.addEventListener('click', handleLogout);

    function handleLogin() {
        const name = loginBtns.input.value.trim();
        if (!name) return loginBtns.error.classList.remove('hidden');

        let emp = employees.find(e => e.name === name);
        if (name === '지니') {
            const password = prompt('관리자 접근을 위해 비밀번호를 입력해주세요:');
            if (!password || password.trim() !== 'weolbuhq#1!') {
                loginBtns.error.textContent = '비밀번호가 틀렸습니다.';
                return loginBtns.error.classList.remove('hidden');
            }
            emp = emp || { name: '지니', isParticipating: true };
        } else if (!emp) {
            loginBtns.error.textContent = '등록되지 않은 구성원입니다.';
            return loginBtns.error.classList.remove('hidden');
        }

        loginBtns.error.classList.add('hidden');
        loginBtns.btn.textContent = '로그인 중...';

        setTimeout(() => {
            currentUser = emp;
            loginBtns.btn.textContent = '로그인';
            showDashboard();
        }, 200);
    }

    function handleLogout() {
        currentUser = null;
        loginBtns.input.value = '';
        views.admin.classList.remove('active');
        document.querySelector('[data-tab="matching-tab"]').click();
        setTimeout(() => views.login.classList.add('active'), 50);
    }

    // --- View Rendering ---
    function showDashboard() {
        if (!currentUser) return; // Guard clause

        views.login.classList.remove('active');
        views.admin.classList.add('active');
        nav.greeting.textContent = `${currentUser.name}님`;

        const isAdmin = currentUser.name === '지니';

        if (isAdmin) {
            nav.tabs.style.display = 'flex';
            headers.admin.classList.remove('hidden');
            headers.user.classList.add('hidden');
            if (historyManager.saveBtn) historyManager.saveBtn.style.display = 'block';

            // Show draft
            renderGroups(groups, matching.weekLabel.textContent, false);
        } else {
            nav.tabs.style.display = 'none';
            headers.admin.classList.add('hidden');
            headers.user.classList.remove('hidden');
            if (historyManager.saveBtn) historyManager.saveBtn.style.display = 'none';

            if (groups && groups.length > 0) {
                renderGroups(groups, matching.weekLabel.textContent + " (진행 중)", true);
            } else if (matchHistory && matchHistory.length > 0) {
                let latestMatch = matchHistory[0];
                renderGroups(latestMatch.groups, latestMatch.date, false);
            } else {
                renderGroups([], "대기 중");
            }
        }

        renderUserParticipationStatus();
    }

    // --- User Participation Logic ---
    userBox.toggleBtn.addEventListener('click', () => {
        let globalEmp = employees.find(e => e.name === currentUser.name);
        if (globalEmp) {
            userBox.toggleBtn.textContent = '처리 중...'; // Add processing state
            userBox.toggleBtn.style.background = '#9CA3AF'; // Gray out while processing
            userBox.toggleBtn.style.cursor = 'not-allowed';

            globalEmp.isParticipating = !globalEmp.isParticipating;
            currentUser.isParticipating = globalEmp.isParticipating;

            // 핵심 편의기능: 만약 현재 "진행 중인 매칭 결과(그룹)"가 있는데
            // 구성원이 "나 오늘 안먹을래!"를 눌렀다면, 매칭 조에서 즉시 쏙 빼버립니다!
            if (!globalEmp.isParticipating && groups && groups.length > 0) {
                let draftChanged = false;
                let newGroups = groups.map(g => {
                    let filtered = g.filter(member => member.id !== globalEmp.id);
                    if (filtered.length !== g.length) draftChanged = true;
                    return filtered;
                }).filter(g => g.length > 0); // 남아있는 사람이 없으면 그룹 폭파
                
                if (draftChanged) {
                    groups = newGroups;
                    saveDraft(groups); // 파이어베이스에 즉시 동기화해 관리자 화면에서 즉각 쏙 사라지게 함
                }
            }

            saveEmployees(); // Syncs to everyone instantly!
        }
    });

    function renderUserParticipationStatus() {
        if (!currentUser) return;
        const isParticipating = currentUser.isParticipating;

        if (isParticipating) {
            userBox.status.className = 'status-box active hidden';
            userBox.status.style.display = 'none';
            userBox.toggleBtn.textContent = '오늘은 따로 먹을게요!';
            userBox.toggleBtn.style.background = '#1C2331';
            userBox.toggleBtn.style.color = '#fff';
            userBox.toggleBtn.style.cursor = 'pointer';
        } else {
            userBox.status.className = 'status-box';
            userBox.status.style.display = 'block';
            userBox.status.textContent = '오늘 매칭에서 빠졌습니다.'; // Removed parenthesis as requested
            userBox.toggleBtn.textContent = '다시 매칭에 참여할래요'; // Updated to match user screenshot
            userBox.toggleBtn.style.background = '#1C2331';
            userBox.toggleBtn.style.color = '#fff';
            userBox.toggleBtn.style.cursor = 'pointer';
        }
        // Note: rendering employee list is handled by the onValue listener for 'employees'
    }

    // --- Advanced Matching Algorithm ---
    matching.runBtn.addEventListener('click', () => {
        matching.runBtn.textContent = '매칭 중...';
        setTimeout(() => {
            generateAdvancedGroups();
            matching.runBtn.textContent = '랜덤 매칭 다시 실행';
        }, 400);
    });

    function buildPenaltyMatrix() {
        if (!matchHistory || matchHistory.length === 0) return {};
        let recentHistory = matchHistory.slice(0, 4);
        let matrix = {};
        recentHistory.forEach((record, weekIndex) => {
            let penaltyWeight = 4 - weekIndex;
            record.groups.forEach(group => {
                for (let i = 0; i < group.length; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        let id1 = group[i].id;
                        let id2 = group[j].id;
                        if (!matrix[id1]) matrix[id1] = {};
                        if (!matrix[id2]) matrix[id2] = {};
                        matrix[id1][id2] = (matrix[id1][id2] || 0) + penaltyWeight;
                        matrix[id2][id1] = (matrix[id2][id1] || 0) + penaltyWeight;
                    }
                }
            });
        });
        return matrix;
    }

    function generateAdvancedGroups() {
        let activeEmps = employees.filter(e => e.isParticipating);
        let newDraft = [];
        let unassigned = [...activeEmps];

        // Shuffle
        for (let i = unassigned.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [unassigned[i], unassigned[j]] = [unassigned[j], unassigned[i]];
        }

        // Buddy logic
        const buddyPairs = unassigned.filter(e => e.buddyId);
        buddyPairs.forEach(mentee => {
            let menteeIndex = unassigned.findIndex(e => e.id == mentee.id);
            if (menteeIndex === -1) return; // already paired

            // Use loose inequality in case buddyId is stored as string
            let buddyIndex = unassigned.findIndex(e => e.id == mentee.buddyId);
            if (buddyIndex !== -1) {
                let buddy = unassigned[buddyIndex];
                let theMentee = unassigned[menteeIndex];
                unassigned = unassigned.filter(e => e.id !== buddy.id && e.id !== theMentee.id);

                let g = [theMentee, buddy];
                g._maxLimit = 2; // Lock buddy pairs strictly to 2 members
                newDraft.push(g);
            }
        });

        const penaltyMatrix = buildPenaltyMatrix();

        function buildDiverseGroup(size, pool, penaltyMatrix, isBucket = false) {
            let group = [pool.shift()];
            while (group.length < size && pool.length > 0) {
                let existingTeams = group.map(e => e.team);
                let candidates = [...pool];
                candidates.forEach(cand => {
                    let score = 0;
                    if (existingTeams.includes(cand.team)) score += 100;

                    // Temporarily add candidate to calculate exact violation score
                    group.push(cand);
                    score += getGroupViolationScore(group, isBucket) * 3000;
                    group.pop();

                    group.forEach(existingMember => {
                        if (penaltyMatrix[cand.id] && penaltyMatrix[cand.id][existingMember.id]) {
                            score += penaltyMatrix[cand.id][existingMember.id] * 10;
                        }
                    });
                    cand._tempScore = score;
                });
                candidates.sort((a, b) => a._tempScore - b._tempScore);
                let bestCandidate = candidates[0];
                let poolIndex = pool.findIndex(e => e.id === bestCandidate.id);
                group.push(pool.splice(poolIndex, 1)[0]);
            }
            return group;
        }

        function getGroupViolationScore(group, isBucket = false) {
            let counts = {};
            group.forEach(e => counts[e.team] = (counts[e.team] || 0) + 1);
            let valArr = Object.values(counts);
            let maxCount = Math.max(...(valArr.length ? valArr : [0]));
            let uniqueTeams = valArr.length;

            let score = 0;
            
            // 같은 팀 2명이 묶이는 경우를 강력하게 찢어놓기 위한 패널티
            if (group.length >= 2 && uniqueTeams === 1) {
                score += 6000; // 2명으로만 묶인 동종팀: 최악 패널티 (~1800만)
            } else if (maxCount === 2) {
                score += 4800; // 3명 그룹 중 2명이 동종팀: 차악 패널티 (~1440만)
            }

            // STRICTLY FORBID 3+ members from the SAME TEAM in the same group, even in buckets
            if (maxCount >= 3) {
                // If it's a bucket and the bucket ONLY has ONE team type, we HAVE to allow it.
                // Otherwise, penalize heavily.
                score += 100000; // (~3억)
            }

            return score;
        }

        const forceInsert = (emp, allowedTeams = null, desperationMode = false, maxGroupSize = 3) => {
            let bestGroup = null;
            let bestScore = Infinity;

            let validDrafts = newDraft;
            if (allowedTeams) {
                validDrafts = newDraft.filter(g => g.every(member => allowedTeams.includes(member.team)));
            }

            if (validDrafts.length === 0) {
                let g = [emp];
                g._maxLimit = maxGroupSize;
                newDraft.push(g);
                return;
            }

            // Check if context allows only one team
            let isHomogenousBucket = allowedTeams && new Set(allowedTeams).size === 1;

            validDrafts.forEach(g => {
                if (g.length >= maxGroupSize) return; // STRICTLY FORBID EXCEEDING DYNAMIC MAX

                let isBuddyGroup = g.some(e => e.buddyId && g.some(b => b.id == e.buddyId));
                let sizePenalty = g.length * 10;
                if (isBuddyGroup && g.length >= 2) sizePenalty += 100000;

                g.push(emp);
                let violation = getGroupViolationScore(g, !!allowedTeams);
                // Forgive homogeneous 3-person penalty IF the bucket is literally only 1 team
                if (isHomogenousBucket && g.length === 3 && new Set(g.map(e => e.team)).size === 1) {
                    violation = 0;
                }
                g.pop();

                let penalty = 0;
                g.forEach(mem => {
                    if (penaltyMatrix[emp.id] && penaltyMatrix[emp.id][mem.id]) {
                        penalty += penaltyMatrix[emp.id][mem.id] * 10;
                    }
                });

                let totalScore = violation * 3000 + penalty + sizePenalty;
                if (totalScore < bestScore) {
                    bestScore = totalScore;
                    bestGroup = g;
                }
            });

            let maxAllowed = 14000000; // 엄격 모드: 같은팀 2명이 있는 그룹(1440만점) 절대 불가! 무조건 다른 팀과 섞이게 유도함.
            if (desperationMode) {
                maxAllowed = 20000000; // 절망 모드: 혼자 밥 먹는 것을 방지하기 위해, 최후의 수단으로만 같은팀 2명 허용(1800만점). 3명은 여전히 불가!
            } else if (isHomogenousBucket) {
                maxAllowed = Infinity; // Pure homogenous buckets can do whatever they want
            }

            if (bestGroup && bestScore < maxAllowed) {
                bestGroup.push(emp);
            } else {
                let g = [emp];
                g._maxLimit = 3;
                newDraft.push(g);
            }
        };

        const pushDraft = (group, maxAllowed) => {
            group._maxLimit = maxAllowed;
            newDraft.push(group);
        };

        function extractValidGroups(pool, maxTeamCount = 2, isBucket = false) {
            let targetSize = 2; // forcefully prefer 2-person
            let rejected = [];

            // Phase 1: Try to pull perfect 0-penalty groups
            while (pool.length >= targetSize) {
                let g = buildDiverseGroup(targetSize, pool, penaltyMatrix, isBucket);
                if (getGroupViolationScore(g, isBucket) === 0) {
                    pushDraft(g, targetSize);
                } else {
                    rejected.push(...g);
                }
            }

            // Phase 2: Combine all imperfects and forcefully pair them up ONLY if they are diverse
            let leftovers = [...pool, ...rejected];
            let finalLeftovers = [];
            while (leftovers.length >= targetSize) {
                let g = buildDiverseGroup(targetSize, leftovers, penaltyMatrix, isBucket);
                if (new Set(g.map(e => e.team)).size > 1) {
                    pushDraft(g, targetSize);
                } else {
                    finalLeftovers.push(g[0]);
                    leftovers.unshift(g[1]); // Put the second back to evaluate with remaining candidates
                }
            }
            finalLeftovers.push(...leftovers);

            return finalLeftovers;
        }

        if (matching.useMarchRule && matching.useMarchRule.checked) {
            let remainingEmps = [...unassigned];

            customRules.forEach(bucketTeams => {
                let rawTeams = Array.isArray(bucketTeams) ? bucketTeams : bucketTeams.split(',');
                let normalizedTargetTeams = rawTeams.map(t => t.replace(/\s+/g, '').toLowerCase()).filter(Boolean);

                // Find matching employees by comparing normalized names
                let bucketEmps = remainingEmps.filter(e => {
                    let normalizedTeam = e.team.replace(/\s+/g, '').toLowerCase();
                    return normalizedTargetTeams.includes(normalizedTeam);
                });

                // Gather the ACTUAL team names that got matched, so forceInsert knows exactly what to look for
                let actualMatchedTeams = [...new Set(bucketEmps.map(e => e.team))];

                remainingEmps = remainingEmps.filter(e => {
                    let normalizedTeam = e.team.replace(/\s+/g, '').toLowerCase();
                    return !normalizedTargetTeams.includes(normalizedTeam);
                });

                // Always try to form 2-person groups from the bucket
                // IMPORTANT: If the bucket only has ONE team type (e.g. just "프롭테크팀"), 
                // getGroupViolationScore will normally reject it (homogenous penalty).
                // We allow homogenous pairs to not throw max penalty inside buckets via 'isBucket=true'.
                let rejects = extractValidGroups(bucketEmps, 2, true);

                // Any odd leftovers MUST stay within their bucket's groups
                rejects.forEach(emp => forceInsert(emp, actualMatchedTeams.length > 0 ? actualMatchedTeams : rawTeams));
            });

            // For everyone else who doesn't belong to any custom rule bucket
            let absoluteRejects = extractValidGroups(remainingEmps, 2);
            absoluteRejects.forEach(emp => forceInsert(emp));

        } else {
            let absoluteRejects = extractValidGroups(unassigned);
            absoluteRejects.forEach(emp => forceInsert(emp));
        }

        // --- GLOBAL CLEANUP SWEEPS ---
        // Sweep 1: Find any remaining 1-person groups (stranded because homogeneous pairs were rejected).
        // Release them from bucket constraints and forcefully assign them anywhere globally.
        let strandedGroups = newDraft.filter(g => g.length === 1);
        newDraft = newDraft.filter(g => g.length > 1);

        let strandedEmps = strandedGroups.map(g => g[0]);
        strandedEmps.forEach(emp => {
            forceInsert(emp, null, false, 4); // No bucket constraint, strict mode, allow up to 4 members
        });

        // Sweep 2 (Desperation): If we STILL have 1-person groups (e.g. only 1 team left globally, and all other groups are full)
        // We MUST allow them to form 2-person homogenous groups so nobody eats alone.
        let superStrandedGroups = newDraft.filter(g => g.length === 1);
        newDraft = newDraft.filter(g => g.length > 1);

        let superStrandedEmps = superStrandedGroups.map(g => g[0]);
        superStrandedEmps.forEach(emp => {
            forceInsert(emp, null, true, 4); // No bucket constraint, desperation mode, allow up to 4 members
        });

        // Clean up the custom _maxLimit property from arrays before saving to Firebase!
        // Otherwise Firebase converts the Array into a plain JSON Object and breaks the UI!
        newDraft.forEach(g => { if (g._maxLimit !== undefined) delete g._maxLimit; });
        saveDraft(newDraft); // Syncs Draft to Firebase immediately
    }
    // --- Rendering & Drag-and-Drop ---
    let draggedMember = null;
    let sourceGroupIndex = null;

    function renderGroups(groupsToRender = groups, dateLabel = '', isDraftView = false) {
        matching.container.innerHTML = '';
        const isAdmin = currentUser && currentUser.name === '지니';

        if (dateLabel) {
            matching.weekLabel.textContent = dateLabel;
            matching.weekLabel.style.color = isDraftView ? '#D97706' : '#111827';
        }

        if (!groupsToRender || groupsToRender.length === 0) {
            matching.container.innerHTML = `
                <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 2rem; background: #F9FAFB; border-radius: 12px; border: 1px dashed #D1D5DB; text-align: center; color: #6B7280; margin-top: 1rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">⏳</div>
                    <h4 style="font-size: 1.2rem; font-weight: 600; color: #374151; margin-bottom: 0.5rem;">아직 매칭 결과가 없습니다.</h4>
                    <p style="font-size: 0.95rem; line-height: 1.5;">관리자가 랜덤 런치를 매칭하면 화면에 결과가 표시됩니다.<br>잠시만 기다려주세요!</p>
                </div>
            `;
            return;
        }

        groupsToRender.forEach((rawGroup, groupIdx) => {
            if (!rawGroup) return; // safety
            // Firebase object-to-array fallback
            let group = Array.isArray(rawGroup) ? rawGroup : Object.values(rawGroup).filter(e => e && e.id);

            const isMyGroup = currentUser && group.some(e => e.name === currentUser.name);
            const card = document.createElement('div');
            card.className = `group-card ${isMyGroup ? 'my-group' : ''}`;
            card.dataset.groupIndex = groupIdx;

            if (isAdmin) {
                card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag-over'); });
                card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
                card.addEventListener('drop', e => handleDrop(e, groupIdx, card));
            }

            let badgeHtml = isMyGroup ? `<span class="my-badge">내 그룹</span>` : '';
            if (isDraftView) badgeHtml += `<span style="background:#FEF3C7; color:#B45309; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left:0.5rem;">[임시 프리뷰]</span>`;

            let isBuddyGroup = group.some(emp => emp.buddyId && group.some(b => b.id === emp.buddyId));
            let buddyGroupBadge = isBuddyGroup ? `<span class="buddy-badge">🤝 버디 조</span>` : '';

            let membersHtml = group.map(emp => {
                const newHireIcon = emp.isNewHire ? '<span class="new-hire-badge" title="신규 입사자">🐥</span>' : '';

                const isMentee = emp.buddyId && group.some(e => e.id === emp.buddyId);
                const isMentor = group.some(e => e.buddyId === emp.id);

                let buddyIconHtml = '';
                if (isMentee) buddyIconHtml = '<span style="font-size:0.8rem; background:#FCE7F3; color:#DB2777; padding:0.1rem 0.4rem; border-radius:4px; margin-left:4px;">버디(신규)</span>';
                else if (isMentor) buddyIconHtml = '<span style="font-size:0.8rem; background:#D1FAE5; color:#047857; padding:0.1rem 0.4rem; border-radius:4px; margin-left:4px;">버디(기존)</span>';

                const colors = getTeamColor(emp.team);
                return `
          <li class="member-item" data-id="${emp.id}" ${isAdmin ? 'draggable="true"' : ''}>
            <div class="member-name">${emp.name} ${newHireIcon} ${buddyIconHtml}</div>
            <div class="member-team team-label" style="background:${colors.bg}; color:${colors.text}">${emp.team}</div>
          </li>
        `;
            }).join('');

            card.innerHTML = `
        <div class="group-title">
          그룹 ${groupIdx + 1} &nbsp;${badgeHtml}
          ${buddyGroupBadge}
        </div>
        <ul class="member-list">
          ${membersHtml}
        </ul>
      `;
            matching.container.appendChild(card);
        });

        if (isAdmin) {
            document.querySelectorAll('.member-item[draggable="true"]').forEach(item => {
                item.addEventListener('dragstart', () => {
                    draggedMember = employees.find(emp => emp.id == item.dataset.id);
                    sourceGroupIndex = parseInt(item.closest('.group-card').dataset.groupIndex);
                    item.classList.add('dragging');
                });
                item.addEventListener('dragend', () => item.classList.remove('dragging'));
            });
        }
    }

    function handleDrop(e, targetGroupIndex, cardElement) {
        e.preventDefault();
        cardElement.classList.remove('drag-over');
        if (!draggedMember || sourceGroupIndex === null || sourceGroupIndex === targetGroupIndex) return;

        const isTargetBuddyGroup = groups[targetGroupIndex].some(emp => emp.buddyId !== null && groups[targetGroupIndex].some(b => b.id === emp.buddyId));
        if (isTargetBuddyGroup && groups[targetGroupIndex].length >= 2) {
            alert('버디 조는 2명(신규 입사자 + 버디)까지만 구성할 수 있습니다.');
            return;
        }

        groups[sourceGroupIndex] = groups[sourceGroupIndex].filter(emp => emp.id !== draggedMember.id);
        groups[targetGroupIndex].push(draggedMember);
        if (groups[sourceGroupIndex].length === 0) groups.splice(sourceGroupIndex, 1);

        saveDraft(groups); // Sync drag/drop to draft Fireabase
    }

    // --- Admin Tabs & Employee Management ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // Strict block for Management Tabs unless logged in as 지니
            if (targetTab === 'employee-tab' || targetTab === 'rules-tab') {
                if (!currentUser || currentUser.name !== '지니') {
                    alert('권한이 없습니다! 오직 관리자(지니) 계정만 관리 탭에 접근할 수 있습니다.');
                    return;
                }
            }

            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });

    function updateEmpCount() {
        if (!employees) return;
        const activeCount = employees.filter(e => e.isParticipating).length;
        if (matching.resultsCount) matching.resultsCount.textContent = activeCount;
    }

    function renderBuddyOptions() {
        if (!employees) return;
        const currentValue = empManager.buddySelect.value;
        empManager.buddySelect.innerHTML = '<option value="">-- 버디 선택 (선택사항) --</option>';
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = `${emp.name} (${emp.team})`;
            empManager.buddySelect.appendChild(opt);
        });
        empManager.buddySelect.value = currentValue;
    }

    function renderEmployeeList() {
        if (!employees) return;
        empManager.list.innerHTML = '';
        employees.forEach(emp => {
            let buddyInfo = '';
            if (emp.buddyId) {
                const buddyObj = employees.find(e => e.id == emp.buddyId);
                if (buddyObj) buddyInfo = `<span style="color:#D97706; font-size:0.85rem;">[🤝 버디: ${buddyObj.name}님]</span>`;
            } else {
                const menteeObj = employees.find(e => e.buddyId == emp.id);
                if (menteeObj) buddyInfo = `<span style="color:#059669; font-size:0.85rem;">[🤝 ${menteeObj.name}님의 버디]</span>`;
            }
            const newHireTag = emp.isNewHire ? '<span class="new-hire-badge">🐥</span>' : '';
            const colors = getTeamColor(emp.team);

            const li = document.createElement('li');
            li.innerHTML = `
        <div style="display: flex; align-items: center; gap: 1rem;">
          <label class="switch" title="참여 상태 변경">
            <input type="checkbox" class="toggle-status-chk" data-id="${emp.id}" ${emp.isParticipating ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
          <div style="display: flex; flex-direction: column; gap: 0.4rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem; line-height: 1;">
              <span class="member-name" style="font-weight:600;">${emp.name}</span> ${newHireTag}
              <span class="team-label" style="background:${colors.bg}; color:${colors.text}; margin-left: 0.5rem;">${emp.team}</span>
              ${buddyInfo}
            </div>
          </div>
        </div>
        <div>
          <button class="edit-btn" data-id="${emp.id}">수정</button>
          <button class="delete-btn" data-id="${emp.id}">삭제</button>
        </div>
      `;
            empManager.list.appendChild(li);
        });

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const emp = employees.find(emp => emp.id == e.target.dataset.id);
                if (emp) startEditEmployee(emp);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                employees = employees.filter(emp => emp.id != e.target.dataset.id);
                saveEmployees();
            });
        });

        document.querySelectorAll('.toggle-status-chk').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const emp = employees.find(emp => emp.id == e.target.dataset.id);
                if (emp) {
                    emp.isParticipating = e.target.checked;
                    
                    // 관리자가 수동으로 불참 처리(토글 OFF) 했을 때도, 진행중인 조 편성에서 즉각 빼버립니다.
                    if (!emp.isParticipating && groups && groups.length > 0) {
                        let draftChanged = false;
                        let newGroups = groups.map(g => {
                            let filtered = g.filter(member => member.id !== emp.id);
                            if (filtered.length !== g.length) draftChanged = true;
                            return filtered;
                        }).filter(g => g.length > 0);
                        
                        if (draftChanged) {
                            groups = newGroups;
                            saveDraft(groups); // 매칭 결과 카드에서 즉시 증발! (새로고침 매칭 안해도 됨)
                        }
                    }
                    saveEmployees();
                }
            });
        });
    }

    let editingEmpId = null;

    function startEditEmployee(emp) {
        empManager.name.value = emp.name;
        empManager.team.value = emp.team;
        empManager.newHire.checked = emp.isNewHire;
        empManager.buddySelect.value = emp.buddyId ? String(emp.buddyId) : '';

        editingEmpId = emp.id;
        empManager.addBtn.textContent = '정보 수정';
        empManager.addBtn.style.background = '#10B981';
        empManager.name.focus();
    }

    empManager.addBtn.addEventListener('click', () => {
        const name = empManager.name.value.trim();
        const team = empManager.team.value.trim() || '소속 미지정';
        const isNewHire = empManager.newHire.checked;
        const buddyId = empManager.buddySelect.value || null;

        console.log(`[SAVE] name=${name}, editingEmpId=${editingEmpId}, buddyId=${buddyId}, type=${typeof buddyId}`);

        if (name) {
            if (editingEmpId) {
                if (employees.some(emp => emp.name === name && String(emp.id) !== String(editingEmpId))) return alert('이미 존재하는 이름입니다.');
                let emp = employees.find(e => String(e.id) === String(editingEmpId));
                console.log(`[SAVE] Found editing emp:`, emp);
                if (emp) {
                    // 1. If changing buddy, clear the OLD buddy's reference to this employee
                    if (String(emp.buddyId) !== String(buddyId)) {
                        if (emp.buddyId) {
                            let oldBuddy = employees.find(e => String(e.id) == String(emp.buddyId));
                            if (oldBuddy && String(oldBuddy.buddyId) == String(emp.id)) oldBuddy.buddyId = null;
                        }
                    }

                    emp.name = name;
                    emp.team = team;
                    emp.isNewHire = isNewHire;
                    emp.buddyId = buddyId;

                    // 2. Set the NEW buddy's reference to point back to us
                    if (buddyId) {
                        let newBuddy = employees.find(e => String(e.id) == String(buddyId));
                        if (newBuddy) {
                            // If new buddy had someone else, clear that someone else
                            if (newBuddy.buddyId && String(newBuddy.buddyId) != String(emp.id)) {
                                let theirOldBuddy = employees.find(e => String(e.id) == String(newBuddy.buddyId));
                                if (theirOldBuddy) theirOldBuddy.buddyId = null;
                            }
                            newBuddy.buddyId = emp.id;
                        }
                    }
                }
                editingEmpId = null;
                empManager.addBtn.textContent = '단건 추가';
                empManager.addBtn.style.background = '#2563EB';
            } else {
                if (employees.some(emp => emp.name === name)) return alert('이미 존재하는 구성원입니다.');
                let newEmp = { id: String(Date.now()), name, team, isParticipating: true, isNewHire, buddyId };
                employees.push(newEmp);

                // Set bidirectional link for new employee
                if (buddyId) {
                    let newBuddy = employees.find(e => String(e.id) === String(buddyId));
                    if (newBuddy) {
                        if (newBuddy.buddyId) {
                            let theirOldBuddy = employees.find(e => String(e.id) === String(newBuddy.buddyId));
                            if (theirOldBuddy) theirOldBuddy.buddyId = null;
                        }
                        newBuddy.buddyId = newEmp.id;
                    }
                }
            }

            saveEmployees();

            empManager.name.value = '';
            empManager.team.value = '';
            empManager.newHire.checked = false;
            empManager.buddySelect.value = '';
        }
    });

    const resetPartBtn = document.getElementById('reset-participation-btn');
    if (resetPartBtn) {
        resetPartBtn.addEventListener('click', () => {
            if (confirm('모든 구성원의 상태를 "오늘 참여 가능"으로 일괄 리셋하시겠습니까?')) {
                employees.forEach(emp => emp.isParticipating = true);
                saveEmployees();
                alert('전원 참여 상태로 리셋되었습니다.');
            }
        });
    }

    const deleteAllBtn = document.getElementById('delete-all-emp-btn');
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', () => {
            if (confirm('정말로 모든 구성원을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다.)')) {
                employees = [];
                saveEmployees();
            }
        });
    }

    // --- Bulk Import Logic ---
    empManager.bulkAddBtn.addEventListener('click', () => {
        const text = empManager.bulkInput.value.trim();
        if (!text) return alert("추가할 데이터를 먼저 붙여넣어주세요.");

        const lines = text.split('\n');
        let addedCount = 0;
        let errors = [];

        lines.forEach(line => {
            const parts = line.split(/[\t,]/).map(p => p.trim());
            if (parts.length < 1 || !parts[0]) return;

            const name = parts[0];
            if (employees.some(emp => emp.name === name)) {
                errors.push(`${name} (중복)`);
                return;
            }

            const team = parts[1] || '소속 미지정';
            const isNewHire = parts[2] && (parts[2].toUpperCase() === 'Y' || parts[2] === 'O' || parts[2] === 'TRUE');
            const buddyName = parts[3];

            let buddyId = null;
            if (buddyName) {
                const buddyEmp = employees.find(e => e.name === buddyName);
                if (buddyEmp) buddyId = buddyEmp.id;
            }

            employees.push({
                id: Date.now() + Math.random(),
                name: name,
                team: team,
                isParticipating: true,
                isNewHire: !!isNewHire,
                buddyId: buddyId
            });
            addedCount++;
        });

        lines.forEach(line => {
            const parts = line.split(/[\t,]/).map(p => p.trim());
            if (parts.length < 4 || !parts[3]) return;
            const name = parts[0];
            const buddyName = parts[3];

            let emp = employees.find(e => e.name === name);
            let buddy = employees.find(e => e.name === buddyName);
            if (emp && buddy && !emp.buddyId) {
                emp.buddyId = buddy.id;
            }
        });

        if (addedCount > 0) {
            saveEmployees(); // Persist bulk import to Firebase
            empManager.bulkInput.value = '';
            alert(`${addedCount}명의 구성원이 일괄 추가되었습니다!` + (errors.length ? `\n\n추가 실패: ${errors.join(', ')}` : ''));
        } else {
            alert(`추가된 구성원이 없습니다.\n\n확인 필요: ${errors.join(', ')}`);
        }
    });

    // --- Rules Management Logic ---
    function renderRulesList() {
        if (!rulesManager.container) return;
        rulesManager.container.innerHTML = '';

        if (!customRules || customRules.length === 0) {
            rulesManager.container.innerHTML = '<p class="empty-state" style="text-align: center; color: var(--text-muted); padding: 1rem 0;">등록된 커스텀 규칙이 없습니다.</p>';
            return;
        }

        customRules.forEach((bucket, idx) => {
            const bucketDiv = document.createElement('div');
            bucketDiv.style.cssText = 'background: #F8FAFC; padding: 1rem; border-radius: 8px; border: 1px solid #E2E8F0; display: flex; align-items: center; gap: 1rem;';

            bucketDiv.innerHTML = `
                 <div style="font-weight: 600; color: #475569; min-width: 60px;">${idx + 1} 풀</div>
                 <input type="text" class="rule-input" data-index="${idx}" value="${bucket.join(', ')}" placeholder="팀명 입력 (쉼표로 구분. 예: HQ팀, 튜터팀)" style="flex: 1; padding: 0.6rem; border: 1px solid #CBD5E1; border-radius: 6px;">
                 <button class="delete-btn delete-rule-btn" data-index="${idx}" style="padding: 0.4rem 0.8rem;">삭제</button>
             `;
            rulesManager.container.appendChild(bucketDiv);
        });

        document.querySelectorAll('.rule-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = e.target.getAttribute('data-index');
                const teams = e.target.value.split(',').map(t => t.trim()).filter(t => t.length > 0);
                customRules[idx] = teams;
            });
        });

        document.querySelectorAll('.delete-rule-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.target.getAttribute('data-index');
                customRules.splice(idx, 1);
                renderRulesList();
            });
        });
    }

    if (rulesManager.addBtn) {
        rulesManager.addBtn.addEventListener('click', () => {
            customRules.push([]);
            renderRulesList();
        });
    }

    if (rulesManager.saveBtn) {
        rulesManager.saveBtn.addEventListener('click', () => {
            // Clean up empty buckets before saving
            customRules = customRules.filter(bucket => bucket.length > 0);
            renderRulesList();
            fbSet(fbRef(db, 'rules'), customRules);
            alert('매칭 규칙이 성공적으로 저장되었습니다!');
        });
    }

    // --- History App Logic ---
    function renderHistoryList() {
        if (!historyManager.list) return;
        historyManager.list.innerHTML = '';

        if (!matchHistory || matchHistory.length === 0) {
            historyManager.list.innerHTML = '<p class="empty-state" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">아직 저장된 히스토리가 없습니다.</p>';
            return;
        }

        matchHistory.forEach((record, index) => {
            const card = document.createElement('div');
            card.style.cssText = 'background: #F9FAFB; padding: 1.5rem; border-radius: 8px; border: 1px solid #E5E7EB; position: relative;';

            const dateStr = record.date || '날짜 미지정';

            let groupsHtml = [];
            if (record.groups) {
                groupsHtml = record.groups.map((group, idx) => {
                    let memberNames = group.map(m => m.name).join(', ');
                    return `<div style="margin-top: 0.5rem; font-size: 0.95rem;"><span style="font-weight: 600; color: var(--primary);">그룹 ${idx + 1}:</span> ${memberNames}</div>`;
                }).join('');
            }

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E5E7EB; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                    <h4 style="font-size: 1.1rem; margin: 0;">${dateStr} 기록</h4>
                    <button class="text-btn delete-record-btn" data-index="${index}" style="color: #EF4444; font-size: 0.9rem; padding: 0.2rem 0.5rem;">🗑️ 삭제</button>
                </div>
                <div>${groupsHtml}</div>
            `;
            historyManager.list.appendChild(card);
        });

        document.querySelectorAll('.delete-record-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.target.getAttribute('data-index');
                if (confirm("이 주차의 매칭 기록을 삭제하시겠습니까?")) {
                    matchHistory.splice(idx, 1);
                    fbSet(fbRef(db, 'history'), matchHistory);
                }
            });
        });
    }

    if (historyManager.saveBtn) {
        historyManager.saveBtn.addEventListener('click', () => {
            if (groups.length === 0) return alert("저장할 매칭 결과가 없습니다. 먼저 매칭을 실행해주세요.");

            const dateStr = matching.weekLabel.textContent;

            matchHistory.unshift({
                date: dateStr,
                groups: groups.map(g => [...g]),
                timestamp: Date.now()
            });

            fbSet(fbRef(db, 'history'), matchHistory);
            clearDraft();

            // 확정 저장 시 "오늘 안먹을래요" 한 사람들 전원 다음주를 위해 자동 리셋
            employees.forEach(emp => {
                emp.isParticipating = true;
            });
            saveEmployees();

            alert(`${dateStr} 매칭 결과가 저장 및 확정(Publish) 되었습니다!\n\n💡 불참자(안먹을래요) 상태도 모두 '참여 가능'으로 자동 리셋되었습니다!`);
        });
    }

    if (historyManager.clearBtn) {
        historyManager.clearBtn.addEventListener('click', () => {
            if (confirm("모든 히스토리 기록을 삭제하시겠습니까? (과거 매칭 회피 알고리즘이 초기화됩니다)")) {
                matchHistory = [];
                fbSet(fbRef(db, 'history'), []);
            }
        });
    }

});
