/* ==========================================================================
   SERIAL MONITOR & SCALE ANALYZER - JAVASCRIPT FRONTEND
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const portSelect = document.getElementById('portSelect');
    const baudRate = document.getElementById('baudRate');
    const dataBits = document.getElementById('dataBits');
    const parity = document.getElementById('parity');
    const stopBits = document.getElementById('stopBits');
    const readTimeout = document.getElementById('readTimeout');
    const interGap = document.getElementById('interGap');
    const simModeCheckbox = document.getElementById('simModeCheckbox');

    const startChar = document.getElementById('startChar');
    const endChar = document.getElementById('endChar');
    const startAddr = document.getElementById('startAddr');
    const endAddr = document.getElementById('endAddr');
    const reverseWeight = document.getElementById('reverseWeight');

    const btnConnect = document.getElementById('btnConnect');
    const btnDisconnect = document.getElementById('btnDisconnect');
    const btnTest = document.getElementById('btnTest');
    const btnRefreshPorts = document.getElementById('btnRefreshPorts');
    const btnApplyRules = document.getElementById('btnApplyRules');
    const btnSaveDb = document.getElementById('btnSaveDb');
    const btnToggleScroll = document.getElementById('btnToggleScroll');
    const btnClearLog = document.getElementById('btnClearLog');
    const btnExportLog = document.getElementById('btnExportLog');

    const connectionStatusBadge = document.getElementById('connectionStatusBadge');
    const connectionStatusText = document.getElementById('connectionStatusText');
    const dbStatusText = document.getElementById('dbStatusText');
    const modePill = document.getElementById('modePill');
    const modeText = document.getElementById('modeText');


    const digitalWeight = document.getElementById('digitalWeight');
    const indicatorText = document.getElementById('indicatorText');
    const rawTextStat = document.getElementById('rawTextStat');
    const totalPacketsStat = document.getElementById('totalPacketsStat');
    const lastUpdateStat = document.getElementById('lastUpdateStat');

    const terminalConsole = document.getElementById('terminalConsole');
    const packetTableBody = document.getElementById('packetTableBody');
    const hexGridContainer = document.getElementById('hexGridContainer');
    const inspectorByteCount = document.getElementById('inspectorByteCount');

    const testerInput = document.getElementById('testerInput');
    const testerResult = document.getElementById('testerResult');
    const testerCharStrip = document.getElementById('testerCharStrip');
    const testerFrameText = document.getElementById('testerFrameText');
    const testerSlicedText = document.getElementById('testerSlicedText');
    const presetUserSample = document.getElementById('presetUserSample');
    const presetStxSample = document.getElementById('presetStxSample');
    const reportsTableBody = document.getElementById('reportsTableBody');
    const reportsTotalCount = document.getElementById('reportsTotalCount');
    const reportsLatestId = document.getElementById('reportsLatestId');
    const reportsLatestPeak = document.getElementById('reportsLatestPeak');
    const reportsLatestDuration = document.getElementById('reportsLatestDuration');
    const btnRefreshReports = document.getElementById('btnRefreshReports');

    // App State
    let eventSource = null;
    let isStreaming = false;
    let autoScroll = true;
    let packetCount = 0;
    let packetHistory = [];

    // Initialize
    moveRawDataViewerToCommSettings();
    setupSidebarNav();
    setupEventListeners();
    setupTabs();
    initSseStream();
    loadSettings();
    loadReports();

    function moveRawDataViewerToCommSettings() {
        const viewerCard = document.querySelector('.viewer-card');
        const commRightCol = document.querySelector('#viewCommSettings .comm-right-col');
        if (viewerCard && commRightCol && viewerCard.parentElement !== commRightCol) {
            commRightCol.prepend(viewerCard);
        }
    }

    // Left Vertical Sidebar Navigation Handler (Simplified Navigation)
    function setupSidebarNav() {
        const sideNavItems = document.querySelectorAll('.side-nav-item');
        const mainViews = document.querySelectorAll('.main-view');
        const headerPageTitle = document.getElementById('headerPageTitle');

        sideNavItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetViewId = item.getAttribute('data-view');
                const tabTarget = item.getAttribute('data-tab-target');

                sideNavItems.forEach(i => i.classList.remove('active'));
                mainViews.forEach(v => v.classList.remove('active'));

                item.classList.add('active');

                const activeView = document.getElementById(targetViewId);
                if (activeView) {
                    activeView.classList.add('active');
                }

                if (headerPageTitle) {
                    if (targetViewId === 'viewCommSettings') {
                        headerPageTitle.textContent = 'Communication Settings';
                    } else if (targetViewId === 'viewReports') {
                        headerPageTitle.textContent = 'Graph Session Reports';
                    } else if (tabTarget === 'tabTerminal') {
                        headerPageTitle.textContent = 'Terminal Console';
                    } else if (tabTarget === 'tabTable') {
                        headerPageTitle.textContent = 'Packets Table';
                    } else if (tabTarget === 'tabHexInspector') {
                        headerPageTitle.textContent = 'Hex Matrix Inspector';
                    } else {
                        headerPageTitle.textContent = 'Live Graph';
                    }
                }

                if (tabTarget) {
                    const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabTarget}"]`);
                    if (tabBtn) tabBtn.click();
                }

                if (targetViewId === 'viewLiveGraph') {
                    setTimeout(drawLiveGraphCanvas, 100);
                } else if (targetViewId === 'viewReports') {
                    loadReports();
                }
            });
        });

        const btnToggleSidebar = document.getElementById('btnToggleSidebar');
        const appSidebar = document.querySelector('.app-sidebar');
        if (btnToggleSidebar && appSidebar) {
            btnToggleSidebar.addEventListener('click', () => {
                appSidebar.classList.toggle('collapsed');
                setTimeout(drawLiveGraphCanvas, 260);
            });
        }
    }




    // Fetch Available Ports & Sync Saved Selection
    async function loadPorts(savedPort = null) {
        try {
            const res = await fetch('/api/ports');
            const data = await res.json();
            if (data.status === 'success' && data.ports) {
                const currentSelection = savedPort || portSelect.value || 'com3';
                portSelect.innerHTML = '';
                
                // Add Simulator option first if checkbox checked
                if (simModeCheckbox.checked) {
                    const opt = document.createElement('option');
                    opt.value = 'Simulator';
                    opt.textContent = 'Virtual Scale Simulator (Built-in)';
                    if (currentSelection.toLowerCase() === 'simulator') opt.selected = true;
                    portSelect.appendChild(opt);
                }

                let foundTarget = false;
                data.ports.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.port;
                    option.textContent = `${p.port} - ${p.description}`;
                    if (p.port.toLowerCase() === currentSelection.toLowerCase() && !simModeCheckbox.checked) {
                        option.selected = true;
                        foundTarget = true;
                    }
                    portSelect.appendChild(option);
                });

                if (currentSelection && !foundTarget && currentSelection.toLowerCase() !== 'simulator') {
                    const opt = document.createElement('option');
                    opt.value = currentSelection;
                    opt.textContent = `${currentSelection} (Saved Port)`;
                    opt.selected = true;
                    portSelect.appendChild(opt);
                }
            }
        } catch (err) {
            console.error('Failed to load ports:', err);
        }
    }

    // Load Settings from SQLite DB
    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.status === 'success' && data.settings) {
                const s = data.settings;
                
                if (baudRate) baudRate.value = s.baud_rate;
                if (dataBits) dataBits.value = s.data_bits;
                if (parity) parity.value = s.parity;
                if (stopBits) stopBits.value = s.stop_bits;
                if (readTimeout) readTimeout.value = s.timeout;
                if (interGap) interGap.value = s.gap;
                if (simModeCheckbox) simModeCheckbox.checked = s.is_simulated;

                if (startChar) startChar.value = formatControlCharsForInput(s.start_character);
                if (endChar) endChar.value = formatControlCharsForInput(s.end_character);
                if (startAddr) startAddr.value = s.start_address;
                if (endAddr) endAddr.value = s.end_address;
                if (reverseWeight) reverseWeight.checked = s.reverse_weight;

                updateSimModeUI();
                await loadPorts(s.port);

                if (dbStatusText) {
                    dbStatusText.textContent = 'SQLite DB Loaded';
                }

                const dbInfoPort = document.getElementById('dbInfoPort');
                const dbInfoBaud = document.getElementById('dbInfoBaud');
                const dbInfoMarkers = document.getElementById('dbInfoMarkers');
                const dbInfoUpdated = document.getElementById('dbInfoUpdated');

                if (dbInfoPort) dbInfoPort.textContent = s.port;
                if (dbInfoBaud) dbInfoBaud.textContent = s.baud_rate;
                if (dbInfoMarkers) {
                    const startM = formatControlCharsForInput(s.start_character);
                    const endM = formatControlCharsForInput(s.end_character);
                    dbInfoMarkers.textContent = (startM || endM) ? `${startM || 'None'} / ${endM || 'None'}` : 'None';
                }
                if (dbInfoUpdated) dbInfoUpdated.textContent = s.updated_at || 'Just now';

                runLiveTester();
            }
        } catch (err) {
            console.error('Error loading settings from SQLite DB:', err);
        }
    }

    const btnReloadDb = document.getElementById('btnReloadDb');
    if (btnReloadDb) {
        btnReloadDb.addEventListener('click', () => {
            loadSettings();
            appendTerminalLine('system', '↻ Settings reloaded from SQLite database.');
        });
    }


    // Save All Configuration to SQLite DB
    async function saveDbSettings() {
        const payload = {
            port: portSelect.value,
            baud_rate: parseInt(baudRate.value),
            data_bits: parseInt(dataBits.value),
            parity: parity.value,
            stop_bits: stopBits.value,
            timeout: parseFloat(readTimeout.value),
            gap: parseFloat(interGap.value),
            is_simulated: simModeCheckbox.checked || portSelect.value === 'Simulator',
            start_character: unescapeControlCharsInput(startChar.value),
            end_character: unescapeControlCharsInput(endChar.value),
            start_address: parseInt(startAddr.value || 0),
            end_address: parseInt(endAddr.value || 0),
            reverse_weight: reverseWeight.checked
        };

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                appendTerminalLine('system', '💾 Settings successfully saved to SQLite database.');
                if (dbStatusText) {
                    dbStatusText.textContent = 'SQLite DB Saved';
                    setTimeout(() => {
                        dbStatusText.textContent = 'SQLite DB Active';
                    }, 3000);
                }
            }
        } catch (err) {
            console.error('Failed to save settings:', err);
            appendTerminalLine('system', `⚠️ DB Save Error: ${err.message}`);
        }
    }

    function formatControlCharsForInput(str) {
        if (!str) return '';
        return str
            .replace(/\x02/g, '\\x02')
            .replace(/\x03/g, '\\x03')
            .replace(/\r/g, '\\r')
            .replace(/\n/g, '\\n');
    }

    function updateSimModeUI() {
        if (simModeCheckbox.checked) {
            modeText.textContent = 'SIMULATOR MODE';
            modePill.style.background = 'rgba(245, 158, 11, 0.15)';
            modePill.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            modePill.style.color = '#f59e0b';
        } else {
            modeText.textContent = 'HARDWARE MODE';
            modePill.style.background = 'rgba(6, 182, 212, 0.1)';
            modePill.style.borderColor = 'rgba(6, 182, 212, 0.25)';
            modePill.style.color = '#06b6d4';
        }
    }

    // Toggle Simulator Mode
    simModeCheckbox.addEventListener('change', () => {
        updateSimModeUI();
        loadPorts();
    });


    // Quick Insert Buttons
    document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const insertVal = btn.getAttribute('data-insert');
            const targetInput = btn.closest('.form-group').querySelector('input[type="text"]');
            if (targetInput) {
                targetInput.value = insertVal;
                runLiveTester();
            }
        });
    });

    function unescapeControlCharsInput(str) {
        if (!str) return '';
        return str
            .replace(/\\x02/g, '\x02')
            .replace(/\\x03/g, '\x03')
            .replace(/\\r/g, '\r')
            .replace(/\\n/g, '\n');
    }

    const errorAlertBox = document.getElementById('errorAlertBox');
    const errorAlertText = document.getElementById('errorAlertText');

    function showErrorAlert(msg) {
        if (errorAlertBox && errorAlertText) {
            errorAlertText.textContent = msg;
            errorAlertBox.style.display = 'flex';
        }
    }

    function hideErrorAlert() {
        if (errorAlertBox) {
            errorAlertBox.style.display = 'none';
        }
    }

    function setIndicatorText(label) {
        if (indicatorText) {
            indicatorText.textContent = label;
        }
    }

    // Connect & Start Stream
    btnConnect.addEventListener('click', async () => {
        const payload = {
            port: portSelect.value,
            baud_rate: parseInt(baudRate.value),
            data_bits: parseInt(dataBits.value),
            parity: parity.value,
            stop_bits: stopBits.value,
            timeout: parseFloat(readTimeout.value),
            gap: parseFloat(interGap.value),
            is_simulated: simModeCheckbox.checked || portSelect.value === 'Simulator',
            start_character: unescapeControlCharsInput(startChar.value),
            end_character: unescapeControlCharsInput(endChar.value),
            start_address: parseInt(startAddr.value || 0),
            end_address: parseInt(endAddr.value || 0),
            reverse_weight: reverseWeight.checked
        };

        try {
            hideErrorAlert();
            updateStatusUI('connecting', 'CONNECTING...');
            setIndicatorText('CONNECTING...');
            appendTerminalLine('system', `Connecting to ${payload.port} (${payload.baud_rate} baud, ${payload.data_bits}-${payload.parity[0]}-${payload.stop_bits})...`);
            
            // Ensure SSE stream is active
            initSseStream();

            const res = await fetch('/api/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.status === 'success') {
                isStreaming = true;
                updateStatusUI('streaming', 'STREAMING LIVE');
                setIndicatorText('LISTENING');
                btnConnect.disabled = true;
                btnDisconnect.disabled = false;
                appendTerminalLine('system', `✅ Connected to ${payload.port}. Configuration auto-saved to SQLite DB.`);
            } else {

                updateStatusUI('disconnected', 'CONNECTION ERROR');
                setIndicatorText('ERROR');
                showErrorAlert(data.message || 'Failed to open serial port.');
                appendTerminalLine('system', `⚠️ Connection Error: ${data.message}`);
                btnConnect.disabled = false;
                btnDisconnect.disabled = true;
            }
        } catch (err) {
            updateStatusUI('disconnected', 'CONNECTION ERROR');
            setIndicatorText('ERROR');
            showErrorAlert(`Network or server error: ${err.message}`);
            appendTerminalLine('system', `⚠️ Connection Failure: ${err.message}`);
            btnConnect.disabled = false;
            btnDisconnect.disabled = true;
        }
    });

    // Disconnect
    btnDisconnect.addEventListener('click', async () => {
        try {
            await fetch('/api/disconnect', { method: 'POST' });
            isStreaming = false;
            updateStatusUI('disconnected', 'DISCONNECTED');
            btnConnect.disabled = false;
            btnDisconnect.disabled = true;
            setIndicatorText('STOPPED');
            appendTerminalLine('system', 'Connection closed by user.');
        } catch (err) {
            console.error('Disconnect error:', err);
        }
    });

    // Test Frame Button
    btnTest.addEventListener('click', async () => {
        const payload = {
            port: portSelect.value,
            baud_rate: parseInt(baudRate.value),
            data_bits: parseInt(dataBits.value),
            parity: parity.value,
            stop_bits: stopBits.value,
            timeout: parseFloat(readTimeout.value),
            is_simulated: simModeCheckbox.checked || portSelect.value === 'Simulator',
            start_character: unescapeControlCharsInput(startChar.value),
            end_character: unescapeControlCharsInput(endChar.value),
            start_address: parseInt(startAddr.value || 0),
            end_address: parseInt(endAddr.value || 0)
        };

        try {
            appendTerminalLine('system', 'Requesting test snapshot frame...');
            const res = await fetch('/api/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                handleFramePacket({
                    timestamp: new Date().toLocaleTimeString(),
                    frame_index: 'TEST',
                    raw_bytes: data.bytes || [],
                    hex: data.hex || '',
                    text: data.value || '',
                    normalized: data.normalized || ''
                });
            } else {
                appendTerminalLine('system', `Test snapshot response: ${data.message}`);
            }
        } catch (err) {
            appendTerminalLine('system', `Test failed: ${err.message}`);
        }
    });

    // Apply Parsing Rules
    btnApplyRules.addEventListener('click', async () => {
        const payload = {
            start_character: unescapeControlCharsInput(startChar.value),
            end_character: unescapeControlCharsInput(endChar.value),
            start_address: parseInt(startAddr.value || 0),
            end_address: parseInt(endAddr.value || 0),
            reverse_weight: reverseWeight.checked
        };
        try {
            await fetch('/api/update_rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            appendTerminalLine('system', 'Parsing rules updated & saved to SQLite database.');
            if (dbStatusText) {
                dbStatusText.textContent = 'SQLite DB Saved';
                setTimeout(() => { dbStatusText.textContent = 'SQLite DB Active'; }, 3000);
            }
        } catch (err) {
            console.error(err);
        }
    });

    if (btnSaveDb) {
        btnSaveDb.addEventListener('click', saveDbSettings);
    }

    if (btnRefreshReports) {
        btnRefreshReports.addEventListener('click', loadReports);
    }


    btnRefreshPorts.addEventListener('click', loadPorts);

    // EventSource (SSE) Setup
    function initSseStream() {
        if (eventSource && (eventSource.readyState === EventSource.OPEN || eventSource.readyState === EventSource.CONNECTING)) {
            return;
        }
        if (eventSource) {
            try { eventSource.close(); } catch(e) {}
        }
        eventSource = new EventSource('/api/stream');
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'frame') {
                    handleFramePacket(data);
                } else if (data.type === 'info') {
                    appendTerminalLine('system', `ℹ️ ${data.message}`);
                } else if (data.type === 'error') {
                    updateStatusUI('disconnected', 'CONNECTION ERROR');
                    appendTerminalLine('system', `⚠️ ${data.message}`);
                    btnConnect.disabled = false;
                    btnDisconnect.disabled = true;
                    setIndicatorText('ERROR');
                }
            } catch (err) {
                console.error('SSE Error parsing JSON:', err);
            }
        };
        eventSource.onerror = (err) => {
            console.warn('SSE connection interrupted, retrying...', err);
        };
    }

    // Process Incoming Serial Frame Packet
    function handleFramePacket(pkt) {
        packetCount++;
        packetHistory.push(pkt);

        // Update Scale Display Card
        if (pkt.normalized) {
            digitalWeight.textContent = pkt.normalized;
        } else if (pkt.text) {
            digitalWeight.textContent = pkt.text;
        }
        setIndicatorText('DATA RECEIVING');
        rawTextStat.textContent = escapeControlChars(pkt.text);
        totalPacketsStat.textContent = packetCount;
        lastUpdateStat.textContent = pkt.timestamp;

        // 1. Update Terminal Console
        appendTerminalLine('data', pkt);

        // 2. Update Packets Table
        appendTableRow(pkt);

        // 3. Update Hex Inspector Grid
        renderHexGrid(pkt.raw_bytes || []);

        // 4. Record Graph Sample if recording active
        if (isGraphRecording) {
            recordGraphSample(pkt);
        }
    }


    // Terminal Line Renderer
    function appendTerminalLine(type, content) {
        const line = document.createElement('div');
        line.classList.add('terminal-line');

        if (type === 'system') {
            line.classList.add('system-line');
            const time = new Date().toLocaleTimeString();
            line.innerHTML = `<span class="t-time">[${time}]</span> <span class="t-msg">${content}</span>`;
        } else {
            line.classList.add('data-line');
            const hexShort = content.hex.length > 24 ? content.hex.substring(0, 24) + '...' : content.hex;
            line.innerHTML = `
                <span class="t-time">[${content.timestamp}]</span>
                <span class="t-hex">HEX: ${hexShort}</span>
                <span class="t-text">TXT: "${escapeControlChars(content.text)}"</span>
                <span class="t-norm">➔ ${content.normalized || 'N/A'}</span>
            `;
        }

        terminalConsole.appendChild(line);

        // Limit terminal line history to 300 to preserve performance
        if (terminalConsole.children.length > 300) {
            terminalConsole.removeChild(terminalConsole.firstChild);
        }

        if (autoScroll) {
            terminalConsole.scrollTop = terminalConsole.scrollHeight;
        }
    }

    // Table Row Renderer
    function appendTableRow(pkt) {
        // Remove empty placeholder row
        const emptyRow = packetTableBody.querySelector('.empty-row');
        if (emptyRow) emptyRow.remove();

        const tr = document.createElement('tr');
        const bytesRepr = `b'${escapeControlChars(pkt.text)}'`;
        tr.innerHTML = `
            <td>${pkt.frame_index}</td>
            <td>${pkt.timestamp}</td>
            <td><code>${bytesRepr}</code></td>
            <td><code>${pkt.hex}</code></td>
            <td>${escapeControlChars(pkt.text)}</td>
            <td style="color: var(--digital-green); font-weight: bold;">${pkt.normalized || '--'}</td>
        `;

        packetTableBody.insertBefore(tr, packetTableBody.firstChild);

        // Limit table rows to 100
        if (packetTableBody.children.length > 100) {
            packetTableBody.removeChild(packetTableBody.lastChild);
        }
    }

    // Hex Inspector Grid Renderer
    function renderHexGrid(byteList) {
        if (!byteList || byteList.length === 0) return;

        inspectorByteCount.textContent = `${byteList.length} bytes`;
        hexGridContainer.innerHTML = '';

        byteList.forEach((b, index) => {
            const hexStr = b.toString(16).padStart(2, '0').toUpperCase();
            let charStr = String.fromCharCode(b);
            let category = 'ascii';

            if (b === 13) {
                charStr = '\\r';
                category = 'delimiter';
            } else if (b === 10) {
                charStr = '\\n';
                category = 'delimiter';
            } else if (b === 2) {
                charStr = 'STX';
                category = 'control';
            } else if (b === 3) {
                charStr = 'ETX';
                category = 'control';
            } else if (b < 32 || b > 126) {
                charStr = `0x${hexStr}`;
                category = 'control';
            }

            const card = document.createElement('div');
            card.className = `hex-byte-card ${category}`;
            card.innerHTML = `
                <span class="byte-hex">${hexStr}</span>
                <span class="byte-char">${charStr}</span>
            `;
            hexGridContainer.appendChild(card);
        });
    }

    // Control Character Escaper
    function escapeControlChars(str) {
        if (!str) return '';
        return str
            .replace(/\x02/g, '[STX]')
            .replace(/\x03/g, '[ETX]')
            .replace(/\r/g, '[CR]')
            .replace(/\n/g, '[LF]');
    }

    // Status UI & Sidebar Connection Card Sync
    const sidebarDot = document.getElementById('sidebarDot');
    const sidebarStatusText = document.getElementById('sidebarStatusText');
    const sidebarPortInfo = document.getElementById('sidebarPortInfo');
    const sidebarBaudInfo = document.getElementById('sidebarBaudInfo');
    const sidebarTimeInfo = document.getElementById('sidebarTimeInfo');
    const streamStatusPill = document.getElementById('streamStatusPill');
    const streamStatusText = document.getElementById('streamStatusText');

    function updateStatusUI(type, label) {
        if (connectionStatusBadge) connectionStatusBadge.className = `status-badge ${type}`;
        if (connectionStatusText) connectionStatusText.textContent = label;

        if (streamStatusPill) {
            streamStatusPill.className = `header-pill receiving ${type}`;
        }
        if (streamStatusText) streamStatusText.textContent = label;

        if (sidebarDot) {
            sidebarDot.className = `sidebar-dot ${type === 'streaming' || type === 'connecting' ? 'connected' : 'disconnected'}`;
        }
        if (sidebarStatusText) sidebarStatusText.textContent = label;
        if (sidebarPortInfo) sidebarPortInfo.textContent = `${portSelect ? portSelect.value : 'COM3'} Serial Port`;
        if (sidebarBaudInfo && baudRate && dataBits && parity && stopBits) {
            const p = parity.value ? parity.value[0] : 'N';
            sidebarBaudInfo.textContent = `${baudRate.value} • ${dataBits.value}${p}${stopBits.value}`;
        }
        if (sidebarTimeInfo) sidebarTimeInfo.textContent = new Date().toLocaleTimeString();
    }

    const chkAutoScroll = document.getElementById('chkAutoScroll');
    if (chkAutoScroll) {
        chkAutoScroll.addEventListener('change', () => {
            autoScroll = chkAutoScroll.checked;
        });
    }


    // Clear Console
    btnClearLog.addEventListener('click', () => {
        terminalConsole.innerHTML = '';
        packetTableBody.innerHTML = '<tr class="empty-row"><td colspan="6">Console cleared. Waiting for frames...</td></tr>';
        hexGridContainer.innerHTML = '<div class="empty-inspector">Waiting for frame packet to inspect...</div>';
        appendTerminalLine('system', 'Console cleared.');
    });

    // Export Log to JSON
    btnExportLog.addEventListener('click', () => {
        if (packetHistory.length === 0) {
            alert('No serial frame data captured yet to export.');
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(packetHistory, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `serial_log_${Date.now()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });

    // Tabs Setup
    function setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-tab');

                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                document.getElementById(targetId).classList.add('active');
                if (targetId === 'tabLiveGraph') {
                    setTimeout(drawLiveGraphCanvas, 50);
                }
            });
        });
    }

    function setupEventListeners() {
        testerInput.addEventListener('input', runLiveTester);
        startChar.addEventListener('input', runLiveTester);
        endChar.addEventListener('input', runLiveTester);
        startAddr.addEventListener('input', runLiveTester);
        endAddr.addEventListener('input', runLiveTester);
        reverseWeight.addEventListener('change', runLiveTester);

        if (presetUserSample) {
            presetUserSample.addEventListener('click', () => {
                testerInput.value = '05[0 00000]$%05[0 00000]$%';
                startChar.value = '05[';
                endChar.value = '$%';
                startAddr.value = '3';
                endAddr.value = '7';
                runLiveTester();
            });
        }

        if (presetStxSample) {
            presetStxSample.addEventListener('click', () => {
                testerInput.value = '\\x02  0012.45 kg\\r\\n';
                startChar.value = '\\x02';
                endChar.value = '\\r';
                startAddr.value = '0';
                endAddr.value = '0';
                runLiveTester();
            });
        }

        // Trigger initial test run for preset
        runLiveTester();
    }

    async function runLiveTester() {
        const payload = {
            raw_text: testerInput.value.replace(/\\x02/g, '\x02').replace(/\\x03/g, '\x03').replace(/\\r/g, '\r').replace(/\\n/g, '\n'),
            start_character: startChar.value.replace(/\\x02/g, '\x02').replace(/\\x03/g, '\x03'),
            end_character: endChar.value.replace(/\\x03/g, '\x03').replace(/\\r/g, '\r').replace(/\\n/g, '\n'),
            start_address: parseInt(startAddr.value || 0),
            end_address: parseInt(endAddr.value || 0),
            reverse_weight: reverseWeight.checked
        };

        try {
            const res = await fetch('/api/parse_test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                testerResult.textContent = data.normalized !== '' ? data.normalized : '(Empty String)';
                if (testerFrameText) testerFrameText.textContent = escapeControlChars(data.frame_text) || '(None)';
                if (testerSlicedText) testerSlicedText.textContent = escapeControlChars(data.sliced_text) || '(None)';

                renderCharStrip(data);
            }
        } catch (err) {
            console.error('Parse test error:', err);
        }
    }

    function renderCharStrip(data) {
        if (!testerCharStrip) return;
        testerCharStrip.innerHTML = '';
        const rawStr = data.raw_text || '';
        if (!rawStr) {
            testerCharStrip.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 10px;">Type or paste text above to render character position strip.</div>';
            return;
        }

        const startPos = data.start_pos;
        const endPos = data.end_pos;
        const startLen = data.start_marker_len || 0;
        const endLen = data.end_marker_len || 0;
        const frameOffset = data.frame_offset || 0;

        const startAddrVal = parseInt(startAddr.value || 0);
        const endAddrVal = parseInt(endAddr.value || 0);

        Array.from(rawStr).forEach((ch, idx) => {
            const pos1Based = idx + 1;
            const tile = document.createElement('div');
            tile.className = 'char-tile';

            let chDisplay = ch;
            if (ch === '\r') chDisplay = '\\r';
            else if (ch === '\n') chDisplay = '\\n';
            else if (ch === '\x02') chDisplay = 'STX';
            else if (ch === '\x03') chDisplay = 'ETX';
            else if (ch === ' ') chDisplay = '␣';

            // Highlights
            if (startPos >= 0 && idx >= startPos && idx < (startPos + startLen)) {
                tile.classList.add('start-marker');
            } else if (endPos >= 0 && idx >= endPos && idx < (endPos + endLen)) {
                tile.classList.add('end-marker');
            } else if (startPos >= 0 && endPos >= 0 && idx >= frameOffset && idx < endPos) {
                tile.classList.add('in-frame');
            }

            // Slice Highlight
            if (startAddrVal || endAddrVal) {
                let isInSlice = false;
                if (idx >= frameOffset && (endPos < 0 || idx < endPos)) {
                    const frameCharIdx = idx - frameOffset + 1; // 1-based inside frame
                    const sIdx = startAddrVal ? startAddrVal : 1;
                    const eIdx = endAddrVal ? endAddrVal : 9999;
                    if (frameCharIdx >= sIdx && frameCharIdx <= eIdx) {
                        isInSlice = true;
                    }
                }
                if (isInSlice) {
                    tile.classList.add('in-slice');
                }
            }

            tile.innerHTML = `
                <span class="tile-char">${chDisplay}</span>
                <span class="tile-idx">${pos1Based}</span>
            `;

            // Click character tile to quickly set start or end address
            tile.addEventListener('click', () => {
                if (idx >= frameOffset && (endPos < 0 || idx < endPos)) {
                    const frameCharIdx = idx - frameOffset + 1;
                    if (!startAddrVal || (startAddrVal && endAddrVal)) {
                        startAddr.value = frameCharIdx;
                        endAddr.value = 0;
                    } else {
                        if (frameCharIdx >= startAddrVal) {
                            endAddr.value = frameCharIdx;
                        } else {
                            endAddr.value = startAddrVal;
                            startAddr.value = frameCharIdx;
                        }
                    }
                    runLiveTester();
                }
            });

            testerCharStrip.appendChild(tile);
        });
    }

    // ==========================================================================
    // LIVE GRAPH & PEAK DETECTION LOGIC
    // ==========================================================================
    const btnStartGraph = document.getElementById('btnStartGraph');
    const btnStopGraph = document.getElementById('btnStopGraph');
    const btnClearGraph = document.getElementById('btnClearGraph');
    const graphStatusBadge = document.getElementById('graphStatusBadge');
    const graphStatusText = document.getElementById('graphStatusText');

    const peakSummaryCard = document.getElementById('peakSummaryCard');
    const peakValueVal = document.getElementById('peakValueVal');
    const peakSampleCount = document.getElementById('peakSampleCount');
    const peakAvgVal = document.getElementById('peakAvgVal');
    const peakFrameIdx = document.getElementById('peakFrameIdx');
    const peakTimestampTag = document.getElementById('peakTimestampTag');

    const liveGraphCanvas = document.getElementById('liveGraphCanvas');
    const canvasOverlayHint = document.getElementById('canvasOverlayHint');

    let isGraphRecording = false;
    let graphSamples = [];
    let peakResult = null;
    let sessionStartTime = null;
    let sessionEndTime = null;

    const btnResetZoom = document.getElementById('btnResetZoom');
    if (btnResetZoom) {
        btnResetZoom.addEventListener('click', () => {
            drawLiveGraphCanvas();
            appendTerminalLine('system', '🔍 Graph view and scale refreshed.');
        });
    }

    if (btnStartGraph) {
        btnStartGraph.addEventListener('click', startGraphRecording);
    }
    if (btnStopGraph) {
        btnStopGraph.addEventListener('click', stopGraphRecording);
    }
    if (btnClearGraph) {
        btnClearGraph.addEventListener('click', clearGraph);
    }

    function startGraphRecording() {
        if (!isStreaming && btnConnect && !btnConnect.disabled) {
            appendTerminalLine('system', '⚡ Serial connection not active. Automatically connecting...');
            btnConnect.click();
        }

        graphSamples = [];
        peakResult = null;
        isGraphRecording = true;
        sessionStartTime = new Date();

        if (peakSummaryCard) peakSummaryCard.style.display = 'none';
        if (canvasOverlayHint) canvasOverlayHint.style.display = 'none';

        if (btnStartGraph) btnStartGraph.disabled = true;
        if (btnStopGraph) btnStopGraph.disabled = false;

        if (graphStatusBadge) {
            graphStatusBadge.className = 'graph-status-badge recording';
            if (graphStatusText) graphStatusText.textContent = 'Tracking Live Graph...';
        }

        appendTerminalLine('system', `📈 Live graph recording started at ${sessionStartTime.toLocaleTimeString()}.`);
        drawLiveGraphCanvas();
    }

    function stopGraphRecording() {
        isGraphRecording = false;
        sessionEndTime = new Date();

        if (btnStartGraph) btnStartGraph.disabled = false;
        if (btnStopGraph) btnStopGraph.disabled = true;

        if (graphStatusBadge) {
            graphStatusBadge.className = 'graph-status-badge stopped';
            if (graphStatusText) graphStatusText.textContent = 'Tracking Stopped (Peak & Report Saved)';
        }

        calculatePeakMetrics();
        drawLiveGraphCanvas();
        saveSessionReportToDb();
    }

    async function saveSessionReportToDb() {
        if (!graphSamples || graphSamples.length === 0) return;

        const startTimeStr = sessionStartTime ? sessionStartTime.toLocaleTimeString() : new Date().toLocaleTimeString();
        const endTimeStr = sessionEndTime ? sessionEndTime.toLocaleTimeString() : new Date().toLocaleTimeString();
        const durationSec = sessionStartTime && sessionEndTime 
            ? Math.max(0.1, (sessionEndTime - sessionStartTime) / 1000).toFixed(1)
            : '0.0';

        const peakVal = peakResult ? peakResult.peakValue : 0;

        const peakDurationVal = document.getElementById('peakDurationVal');
        const peakStartEndSub = document.getElementById('peakStartEndSub');
        if (peakDurationVal) peakDurationVal.textContent = durationSec + 's';
        if (peakStartEndSub) peakStartEndSub.textContent = `Start ${startTimeStr} to ${endTimeStr}`;

        const payload = {
            maximum_peak: peakVal,
            start_time: startTimeStr,
            end_time: endTimeStr,
            time_taken_seconds: parseFloat(durationSec),
            sample_count: graphSamples.length
        };

        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success' && data.report) {
                appendTerminalLine('system', `📋 Saved Report #${data.report.report_code} to SQLite DB (Peak: ${data.report.maximum_peak} KG, Duration: ${data.report.time_taken_seconds}s).`);
                loadReports();
            }
        } catch (err) {
            console.error('Failed to save session report:', err);
        }
    }

    async function loadReports() {
        const reportsTableBody = document.getElementById('reportsTableBody');
        const reportsCountVal = document.getElementById('reportsCountVal');
        const reportsMaxPeakVal = document.getElementById('reportsMaxPeakVal');
        const reportsLastTimeVal = document.getElementById('reportsLastTimeVal');

        if (!reportsTableBody) return;

        try {
            const res = await fetch('/api/reports');
            const data = await res.json();

            if (data.status === 'success') {
                const reports = data.reports || [];

                if (reportsCountVal) reportsCountVal.textContent = reports.length;

                if (reports.length === 0) {
                    reportsTableBody.innerHTML = '<tr class="empty-row"><td colspan="8">No graph session reports recorded in SQLite DB yet. Click <b>Start</b> and <b>Stop</b> on Live Graph to create reports!</td></tr>';
                    if (reportsMaxPeakVal) reportsMaxPeakVal.textContent = '0.00 KG';
                    if (reportsLastTimeVal) reportsLastTimeVal.textContent = 'None';
                    return;
                }

                const maxPeakEver = Math.max(...reports.map(r => r.maximum_peak)).toFixed(2);
                if (reportsMaxPeakVal) reportsMaxPeakVal.textContent = `${maxPeakEver} KG`;
                if (reportsLastTimeVal) reportsLastTimeVal.textContent = reports[0].created_at || reports[0].end_time;

                reportsTableBody.innerHTML = '';
                reports.forEach(rpt => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><span class="rpt-code-badge">${rpt.report_code}</span></td>
                        <td><span class="peak-weight-tag">${rpt.maximum_peak.toFixed(2)} KG</span></td>
                        <td>${rpt.start_time}</td>
                        <td>${rpt.end_time}</td>
                        <td><span class="duration-tag">${rpt.time_taken_seconds}s</span></td>
                        <td>${rpt.sample_count}</td>
                        <td>${rpt.created_at || 'Just now'}</td>
                        <td>
                            <button type="button" class="btn btn-danger" style="padding: 4px 10px; font-size: 0.75rem;" onclick="deleteReportRecord(${rpt.id})">
                                Delete
                            </button>
                        </td>
                    `;
                    reportsTableBody.appendChild(tr);
                });
            }
        } catch (err) {
            console.error('Error fetching reports:', err);
        }
    }

    window.deleteReportRecord = async function(id) {
        if (!confirm(`Delete report #${id} from SQLite database?`)) return;
        try {
            await fetch(`/api/reports/${id}`, { method: 'DELETE' });
            loadReports();
            appendTerminalLine('system', `Report #${id} deleted from SQLite DB.`);
        } catch (err) {
            console.error(err);
        }
    };

    const btnClearAllReports = document.getElementById('btnClearAllReports');
    if (btnClearAllReports) {
        btnClearAllReports.addEventListener('click', async () => {
            if (!confirm('Clear all session reports from SQLite database?')) return;
            try {
                await fetch('/api/reports/clear', { method: 'POST' });
                loadReports();
                appendTerminalLine('system', 'All reports cleared from SQLite DB.');
            } catch (err) {
                console.error(err);
            }
        });
    }


    function clearGraph() {
        isGraphRecording = false;
        graphSamples = [];
        peakResult = null;

        if (btnStartGraph) btnStartGraph.disabled = false;
        if (btnStopGraph) btnStopGraph.disabled = true;

        if (peakSummaryCard) peakSummaryCard.style.display = 'none';
        if (canvasOverlayHint) canvasOverlayHint.style.display = 'block';

        if (graphStatusBadge) {
            graphStatusBadge.className = 'graph-status-badge idle';
            if (graphStatusText) graphStatusText.textContent = 'Graph Idle';
        }

        appendTerminalLine('system', 'Graph cleared.');
        drawLiveGraphCanvas();
    }

    function recordGraphSample(pkt) {
        let numVal = NaN;
        if (pkt.normalized !== undefined && pkt.normalized !== '') {
            numVal = parseFloat(pkt.normalized);
        }
        if (isNaN(numVal) && pkt.text) {
            const m = pkt.text.match(/-?\d+(?:\.\d+)?/);
            if (m) numVal = parseFloat(m[0]);
        }

        if (!isNaN(numVal)) {
            graphSamples.push({
                time: pkt.timestamp || new Date().toLocaleTimeString(),
                frameIndex: pkt.frame_index || graphSamples.length + 1,
                value: numVal,
                text: pkt.text || ''
            });

            if (canvasOverlayHint) canvasOverlayHint.style.display = 'none';
            updateSummaryBarMetrics();
            drawLiveGraphCanvas();
        }
    }

    function updateSummaryBarMetrics() {
        const statMinVal = document.getElementById('statMinVal');
        const statMaxVal = document.getElementById('statMaxVal');
        const statAvgVal = document.getElementById('statAvgVal');
        const statSamplesCount = document.getElementById('statSamplesCount');

        if (!graphSamples || graphSamples.length === 0) {
            if (statMinVal) statMinVal.textContent = '0.00';
            if (statMaxVal) statMaxVal.textContent = '0.00';
            if (statAvgVal) statAvgVal.textContent = '0.00';
            if (statSamplesCount) statSamplesCount.textContent = '0';
            return;
        }

        const vals = graphSamples.map(s => s.value);
        const minV = Math.min(...vals).toFixed(2);
        const maxV = Math.max(...vals).toFixed(2);
        const sumV = vals.reduce((a, b) => a + b, 0);
        const avgV = (sumV / vals.length).toFixed(2);

        if (statMinVal) statMinVal.textContent = minV;
        if (statMaxVal) statMaxVal.textContent = maxV;
        if (statAvgVal) statAvgVal.textContent = avgV;
        if (statSamplesCount) statSamplesCount.textContent = graphSamples.length;
    }


    function calculatePeakMetrics() {
        if (!graphSamples || graphSamples.length === 0) {
            appendTerminalLine('system', '⚠️ No data points were captured during the graphing session to calculate peak.');
            return;
        }

        let maxSample = graphSamples[0];
        let sumVal = 0;

        graphSamples.forEach((sample) => {
            sumVal += sample.value;
            if (sample.value > maxSample.value) {
                maxSample = sample;
            }
        });

        const maxIdx = graphSamples.indexOf(maxSample);
        const avgVal = (sumVal / graphSamples.length).toFixed(2);

        peakResult = {
            peakValue: maxSample.value,
            peakIndex: maxIdx,
            timestamp: maxSample.time,
            frameIndex: maxSample.frameIndex,
            avgValue: avgVal,
            sampleCount: graphSamples.length
        };

        if (peakSummaryCard) {
            if (peakValueVal) peakValueVal.textContent = maxSample.value.toFixed(2) + ' KG';
            if (peakSampleCount) peakSampleCount.textContent = graphSamples.length;
            if (peakAvgVal) peakAvgVal.textContent = avgVal + ' KG';
            if (peakFrameIdx) peakFrameIdx.textContent = '#' + maxSample.frameIndex;
            if (peakTimestampTag) peakTimestampTag.textContent = 'Detected at ' + maxSample.time;
            peakSummaryCard.style.display = 'block';
        }

        appendTerminalLine('system', `⚡ PEAK DETECTED: ${maxSample.value.toFixed(2)} KG at ${maxSample.time} (Frame #${maxSample.frameIndex}) across ${graphSamples.length} samples.`);
    }

    function drawLiveGraphCanvas() {
        if (!liveGraphCanvas) return;
        const ctx = liveGraphCanvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = liveGraphCanvas.getBoundingClientRect();
        
        if (rect.width === 0 || rect.height === 0) return;

        if (liveGraphCanvas.width !== Math.floor(rect.width * dpr) || liveGraphCanvas.height !== Math.floor(rect.height * dpr)) {
            liveGraphCanvas.width = Math.floor(rect.width * dpr);
            liveGraphCanvas.height = Math.floor(rect.height * dpr);
        }

        ctx.save();
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        ctx.fillStyle = '#0a1220';
        ctx.fillRect(0, 0, width, height);

        const padding = { top: 24, right: 34, bottom: 54, left: 58 };
        const graphW = width - padding.left - padding.right;
        const graphH = height - padding.top - padding.bottom;

        let minY = 0;
        let maxY = 10;

        if (graphSamples.length > 0) {
            const vals = graphSamples.map(s => s.value);
            const sampleMax = Math.max(...vals);
            const sampleMin = Math.min(...vals);
            minY = sampleMin < 0 ? Math.floor(sampleMin * 1.1) : 0;
            maxY = Math.max(10, Math.ceil(sampleMax * 1.2));
        }

        ctx.strokeStyle = 'rgba(50, 72, 106, 0.55)';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#a8b3c3';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        const yGridSteps = 10;
        for (let i = 0; i <= yGridSteps; i++) {
            const ratio = i / yGridSteps;
            const y = padding.top + graphH * (1 - ratio);
            const val = minY + (maxY - minY) * ratio;

            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();

            ctx.fillText(val.toFixed(1), padding.left - 8, y);
        }

        const xGridSteps = 7;
        const now = new Date();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i <= xGridSteps; i++) {
            const x = padding.left + (graphW * i / xGridSteps);
            ctx.strokeStyle = 'rgba(50, 72, 106, 0.38)';
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + graphH);
            ctx.stroke();

            const tickDate = new Date(now.getTime() + (i - xGridSteps) * 5000);
            const label = tickDate.toLocaleTimeString([], { hour12: false });
            ctx.fillStyle = '#a8b3c3';
            ctx.fillText(label, x, padding.top + graphH + 12);
        }

        ctx.strokeStyle = 'rgba(116, 132, 154, 0.58)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top + graphH);
        ctx.lineTo(width - padding.right, padding.top + graphH);
        ctx.stroke();

        ctx.save();
        ctx.translate(16, padding.top + graphH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#b7c1cf';
        ctx.font = '11px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Weight (KG / Value)', 0, 0);
        ctx.restore();

        ctx.fillStyle = '#b7c1cf';
        ctx.font = '11px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('Time', padding.left + graphW / 2, height - 32);

        if (graphSamples.length === 0) {
            const zeroY = padding.top + graphH;
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i <= 22; i++) {
                const x = padding.left + (graphW * i / 22);
                const y = zeroY - (i % 5 === 2 ? 3 : i % 7 === 0 ? 1 : 0);
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            for (let i = 0; i <= 22; i++) {
                const x = padding.left + (graphW * i / 22);
                const y = zeroY - (i % 5 === 2 ? 3 : i % 7 === 0 ? 1 : 0);
                ctx.beginPath();
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = '#22c55e';
                ctx.fill();
            }

            drawLegend(ctx, width, height);
            ctx.restore();
            return;
        }

        const pts = graphSamples.map((s, idx) => {
            const xRatio = graphSamples.length > 1 ? idx / (graphSamples.length - 1) : 0.5;
            const yRatio = (s.value - minY) / (maxY - minY);
            return {
                x: padding.left + xRatio * graphW,
                y: padding.top + graphH * (1 - yRatio),
                sample: s
            };
        });

        if (pts.length > 1) {
            const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphH);
            grad.addColorStop(0, 'rgba(34, 197, 94, 0.18)');
            grad.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

            ctx.beginPath();
            ctx.moveTo(pts[0].x, padding.top + graphH);
            ctx.lineTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.lineTo(pts[pts.length - 1].x, padding.top + graphH);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
        }

        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(34, 197, 94, 0.35)';
        ctx.shadowBlur = 5;

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e';
            ctx.fill();
        });

        if (peakResult && peakResult.peakIndex >= 0 && peakResult.peakIndex < pts.length) {
            const pkPt = pts[peakResult.peakIndex];

            ctx.beginPath();
            ctx.arc(pkPt.x, pkPt.y, 9, 0, Math.PI * 2);
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(pkPt.x, pkPt.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#f87171';
            ctx.fill();

            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(pkPt.x, pkPt.y + 10);
            ctx.lineTo(pkPt.x, padding.top + graphH);
            ctx.stroke();
            ctx.setLineDash([]);

            const labelText = `⚡ PEAK: ${peakResult.peakValue.toFixed(2)} KG`;
            ctx.font = 'bold 11px Outfit, sans-serif';
            const textWidth = ctx.measureText(labelText).width;

            let tagX = pkPt.x - textWidth / 2 - 8;
            let tagY = pkPt.y - 32;

            if (tagX < padding.left) tagX = padding.left;
            if (tagX + textWidth + 16 > width - padding.right) tagX = width - padding.right - textWidth - 16;
            if (tagY < padding.top) tagY = pkPt.y + 14;

            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(tagX, tagY, textWidth + 16, 22, 5);
            } else {
                ctx.rect(tagX, tagY, textWidth + 16, 22);
            }
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, tagX + 8, tagY + 11);
        }

        drawLegend(ctx, width, height);
        ctx.restore();
    }

    function drawLegend(ctx, width, height) {
        const label = 'Live Weight';
        const textWidth = ctx.measureText(label).width;
        const legendWidth = textWidth + 42;
        const x = (width - legendWidth) / 2;
        const y = height - 15;

        ctx.fillStyle = 'rgba(34, 197, 94, 0.72)';
        ctx.fillRect(x, y - 7, 30, 10);
        ctx.strokeStyle = '#22c55e';
        ctx.strokeRect(x, y - 7, 30, 10);
        ctx.fillStyle = '#d7dee9';
        ctx.font = '10px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + 38, y - 2);
    }
});
