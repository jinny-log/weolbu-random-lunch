document.addEventListener('DOMContentLoaded', () => {

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
            saveDraft(groups);
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

        // 2. Listen for Employees changes
        fbOnValue(fbRef(db, 'employees'), (snapshot) => {
            const val = snapshot.val();
            if (val) {
                employees = val;
                // Keep current user session synced if they are logged in
                if (currentUser) {
                    const updatedMe = employees.find(e => e.name === currentUser.name);
                    if (updatedMe) currentUser.isParticipating = updatedMe.isParticipating;
                }
            } else {
                // Initial DB population
                fbSet(fbRef(db, 'employees'), defaultEmployees);
                employees = defaultEmployees;
            }
            renderEmployeeList();
            renderBuddyOptions();
            updateEmpCount();
            if (currentUser) renderUserParticipationStatus();
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
                    renderGroups(groups, matching.weekLabel.textContent, false);
                } else {
                    showDashboard(); // Re-evaluates what to show
                }
            }
        });

        // Hide loading screen after a short delay assuming first fetches return
        setTimeout(() => {
            views.loading.style.display = 'none';
        }, 800);
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
            let menteeIndex = unassigned.findIndex(e => e.id === mentee.id);
            if (menteeIndex === -1) return; // already paired

            let buddyIndex = unassigned.findIndex(e => e.id === mentee.buddyId);
            if (buddyIndex !== -1) {
                let buddy = unassigned[buddyIndex];
                let theMentee = unassigned[menteeIndex];
                unassigned = unassigned.filter(e => e.id !== buddy.id && e.id !== theMentee.id);
                newDraft.push([theMentee, buddy]);
            }
        });

        const penaltyMatrix = buildPenaltyMatrix();

        function getGroupViolationScore(group) {
            let counts = {};
            group.forEach(e => counts[e.team] = (counts[e.team] || 0) + 1);
            let valArr = Object.values(counts);
            let maxCount = Math.max(...(valArr.length ? valArr : [0]));
            let uniqueTeams = valArr.length;

            let score = 0;
            // Heavily penalize groups with only 1 team
            if (group.length >= 2 && uniqueTeams === 1) score += 5000;
            // Penalize groups with more than 2 members from the same team
            if (maxCount > 2) score += 2000 * (maxCount - 2);
            return score;
        }

        const forceInsert = (emp) => {
            let bestGroup = null;
            let bestScore = Infinity;
            if (newDraft.length === 0) {
                let g = [emp];
                g._maxLimit = 3;
                newDraft.push(g);
                return;
            }
            newDraft.forEach(g => {
                let currentMaxLimit = g._maxLimit || 3;
                if (g.length >= currentMaxLimit) return; // STRICTLY FORBID EXCEEDING BUCKET MAX

                let isBuddyGroup = g.some(e => e.buddyId && g.some(b => b.id === e.buddyId));
                let sizePenalty = g.length * 10;
                if (isBuddyGroup && g.length >= 2) sizePenalty += 100000;

                g.push(emp);
                let violation = getGroupViolationScore(g);
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

            if (bestGroup) {
                bestGroup.push(emp);
            } else {
                let g = [emp];
                g._maxLimit = 3; // free groups default to 3
                newDraft.push(g);
            }
        };

        const pushDraft = (group, maxAllowed) => {
            group._maxLimit = maxAllowed;
            newDraft.push(group);
        };

        function extractValidGroups(pool, maxTeamCount = 3) {
            let leftovers = [];
            const targetSize = Math.min(maxTeamCount, 3);

            while (pool.length > 0) {
                if (targetSize === 2) {
                    if (pool.length >= 2) {
                        let g = buildDiverseGroup(2, pool, penaltyMatrix);
                        if (getGroupViolationScore(g) === 0) pushDraft(g, 2); else leftovers.push(...g);
                    } else {
                        leftovers.push(pool.pop());
                    }
                } else {
                    if (pool.length === 4) {
                        let g1 = buildDiverseGroup(2, pool, penaltyMatrix);
                        let g2 = buildDiverseGroup(2, pool, penaltyMatrix);
                        if (getGroupViolationScore(g1) === 0) pushDraft(g1, 3); else leftovers.push(...g1);
                        if (getGroupViolationScore(g2) === 0) pushDraft(g2, 3); else leftovers.push(...g2);
                    } else if (pool.length >= 3) {
                        let g = buildDiverseGroup(3, pool, penaltyMatrix);
                        if (getGroupViolationScore(g) === 0) pushDraft(g, 3); else leftovers.push(...g);
                    } else if (pool.length === 2) {
                        let g = buildDiverseGroup(2, pool, penaltyMatrix);
                        if (getGroupViolationScore(g) === 0) pushDraft(g, 3); else leftovers.push(...g);
                    } else {
                        leftovers.push(pool.pop());
                    }
                }
            }
            return leftovers;
        }

        if (matching.useMarchRule && matching.useMarchRule.checked) {
            let remainingEmps = [...unassigned];
            let globalLeftovers = [];

            customRules.forEach(bucketTeams => {
                let teamsArray = Array.isArray(bucketTeams) ? bucketTeams : bucketTeams.split(',').map(t => t.trim());
                let bucketEmps = remainingEmps.filter(e => teamsArray.includes(e.team));
                remainingEmps = remainingEmps.filter(e => !teamsArray.includes(e.team));

                let maxTeamCount = teamsArray.length;
                let rejects = extractValidGroups(bucketEmps, maxTeamCount);
                globalLeftovers.push(...rejects);
            });

            remainingEmps.push(...globalLeftovers);
            let absoluteRejects = extractValidGroups(remainingEmps, 3); // Defaults back to 3

            absoluteRejects.forEach(emp => forceInsert(emp));

        } else {
            let absoluteRejects = extractValidGroups(unassigned);
            absoluteRejects.forEach(emp => forceInsert(emp));
        }

        saveDraft(newDraft); // Syncs Draft to Firebase immediately
    }

    function buildDiverseGroup(size, pool, penaltyMatrix) {
        let group = [pool.shift()];
        while (group.length < size && pool.length > 0) {
            let existingTeams = group.map(e => e.team);
            let candidates = [...pool];
            candidates.forEach(cand => {
                let score = 0;
                if (existingTeams.includes(cand.team)) score += 100;
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

        groupsToRender.forEach((group, groupIdx) => {
            if (!group) return; // safety
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
    let isAuthenticatedAdmin = false; // Session-level admin unlock

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // Strict block for Management Tabs unless logged in as 지니 and password unlocked
            if (targetTab === 'employee-tab' || targetTab === 'rules-tab') {
                if (!currentUser || currentUser.name !== '지니') {
                    alert('권한이 없습니다! 오직 관리자(지니) 계정만 관리 탭에 접근할 수 있습니다.');
                    return;
                }

                if (!isAuthenticatedAdmin) {
                    const password = prompt('관리자 접근을 위해 비밀번호를 입력해주세요:');
                    if (password !== 'weolbu1234!') {
                        alert('비밀번호가 틀렸습니다.');
                        return; // Block tab switch
                    }
                    isAuthenticatedAdmin = true; // Unlock for the rest of the session
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
        empManager.buddySelect.innerHTML = '<option value="">-- 버디 선택 (선택사항) --</option>';
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = `${emp.name} (${emp.team})`;
            empManager.buddySelect.appendChild(opt);
        });
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
                if (emp) emp.isParticipating = e.target.checked;
                saveEmployees();
            });
        });
    }

    let editingEmpId = null;

    function startEditEmployee(emp) {
        empManager.name.value = emp.name;
        empManager.team.value = emp.team;
        empManager.newHire.checked = emp.isNewHire;
        empManager.buddySelect.value = emp.buddyId || '';

        editingEmpId = emp.id;
        empManager.addBtn.textContent = '정보 수정';
        empManager.addBtn.style.background = '#10B981';
        empManager.name.focus();
    }

    empManager.addBtn.addEventListener('click', () => {
        const name = empManager.name.value.trim();
        const team = empManager.team.value.trim() || '소속 미지정';
        const isNewHire = empManager.newHire.checked;
        const buddyId = empManager.buddySelect.value ? parseInt(empManager.buddySelect.value) : null;

        if (name) {
            if (editingEmpId) {
                if (employees.some(emp => emp.name === name && emp.id !== editingEmpId)) return alert('이미 존재하는 이름입니다.');
                let emp = employees.find(e => e.id === editingEmpId);
                if (emp) {
                    emp.name = name;
                    emp.team = team;
                    emp.isNewHire = isNewHire;
                    emp.buddyId = buddyId;
                }
                editingEmpId = null;
                empManager.addBtn.textContent = '단건 추가';
                empManager.addBtn.style.background = '#2563EB';
            } else {
                if (employees.some(emp => emp.name === name)) return alert('이미 존재하는 구성원입니다.');
                employees.push({ id: Date.now(), name, team, isParticipating: true, isNewHire, buddyId });
            }

            saveEmployees();

            empManager.name.value = '';
            empManager.team.value = '';
            empManager.newHire.checked = false;
            empManager.buddySelect.value = '';
        }
    });

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

            alert(`${dateStr} 매칭 결과가 저장 및 확정(Publish) 되었습니다!\n일반 사용자 화면은 '임시 뱃지'가 사라지고 실시간으로 확정본으로 업데이트됩니다.`);
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
