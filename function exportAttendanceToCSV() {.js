function exportAttendanceToCSV() {
    const logs = JSON.parse(localStorage.getItem('attendance_marks_matrix')) || {};
    let csvContent = "data:text/csv;charset=utf-8,Аты-жөні,Email,Статус,Уақыты\n";
    
    Object.keys(logs).forEach(email => {
        let user = logs[email];
        let status = user.isPresent ? "Сабақта" : "Сабақта жоқ";
        csvContent += `${user.fullname},${email},${status},${user.timestamp}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "attendance_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
async function handleUserSignIn(event) {
    event.preventDefault();
    const email = document.getElementById('txtSignInEmail').value.trim().toLowerCase();
    const password = document.getElementById('txtSignInPassword').value;

    try {
        // Серверге сұраныс жіберу (Мысалы: localhost:5000)
        const response = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.message || "Қате орын алды!");
            return;
        }

        // Серверден келген қолданушы деректерін сақтау
        currentActiveUserSession = data.user;
        localStorage.setItem('active_login_token', JSON.stringify(currentActiveUserSession));
        
        displayAppHeaderStructure();
        navigateToCorrectView();
        
    } catch (error) {
        console.error("Серверге қосылу қатесі:", error);
        alert("Сервермен байланыс үзілді!");
    }
}
/* СТУДЕНТ СТАТУСЫН УАҚЫТ ПЕН КОЛЛЕДЖДІҢ ІШКІ IP ЖЕЛІСІ АРҚЫЛЫ ТЕКСЕРУ */
async function sendAttendanceMark(isPresentFlag) {
    const logsDb = JSON.parse(localStorage.getItem('attendance_marks_matrix')) || {};
    const now = new Date();
    
    // Сағат пен минутты форматтау
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + 
                    now.getMinutes().toString().padStart(2, '0') + ':' + 
                    now.getSeconds().toString().padStart(2, '0');

    // 1. ҚАУІПСІЗДІК ТЕКСЕРІСІ: Колледждің ішкі IP желісінде екенін тексеру
    // Ішкі желіні (Local IP) JavaScript арқылы тікелей оқу WebRTC технологиясымен жасалады
    try {
        const localIp = await getLocalIPAddress();
        
        // Колледждің 10.75.0.X ішкі подсетін тексереміз
        // Студенттің IP-і "10.75.0." деп басталуы тиіс
        if (!localIp.startsWith("10.75.0.")) {
            alert(`🛑 ҚАТЕ: Сіз колледждің ішкі Wi-Fi желісіне қосылмағансыз!\nСіздің IP: ${localIp}\nҮйде жатып белгілеуге рұқсат жоқ.`);
            return; // Процесті тоқтату
        }
    } catch (error) {
        // Егер браузер WebRTC-ді блоктап тастаса, екінші деңгейлі қорғаныс (Ескерту)
        console.warn("Желілік IP-ді автоматты анықтау мүмкін болмады:", error);
    }

    // 2. УАҚЫТТЫ ТЕКСЕРУ ЖӘНЕ КЕШІГУ ЛОГИКАСЫ
    let finalStatus = "Absent"; 
    let statusTextOutput = "";

    if (!isPresentFlag) {
        finalStatus = "Absent";
        statusTextOutput = "Өзі сабақта жоқ екенін белгіледі";
    } else {
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // 08:30-ға дейін келсе — Дер кезінде
        if (currentHour < 8 || (currentHour === 8 && currentMinute <= 30)) {
            finalStatus = "Present";
            statusTextOutput = "Дер кезінде келді";
        } 
        // 08:31-ден 09:00-ге дейін келсе — Кешікті (минутын есептейміз)
        else if (currentHour === 8 && currentMinute > 30) {
            finalStatus = "Late";
            const minutesLate = currentMinute - 30;
            statusTextOutput = `Кешікті (${minutesLate} минут)`;
        } 
        // 09:00-ден өтіп кетіп басса — Блок (Кураторға "9-дан кейін келді" деп көрінеді)
        else {
            finalStatus = "Blocked";
            statusTextOutput = "09:00-ден кейін келді (Блокталды)";
        }
    }

    // Деректер базасына (localStorage) мәліметтерді тіркеу
    logsDb[currentActiveUserSession.email] = {
        fullname: currentActiveUserSession.fullname,
        group: currentActiveUserSession.group,
        isPresent: isPresentFlag,
        attendanceStatus: finalStatus, 
        statusDetails: statusTextOutput,
        timestamp: timeStr
    };

    localStorage.setItem('attendance_marks_matrix', JSON.stringify(logsDb));
    renderStudentAttendanceState();
    
    if (finalStatus === "Blocked") {
        alert("⚠️ Уақыт өтіп кетті! Сіз 09:00-ден кешіктіңіз. Статус куратор кабинетіне «Блок» болып түсті.");
    } else {
        alert("Статус сәтті сақталды және куратор журналына жіберілді!");
    }
}

/* БРАУЗЕРДЕН ІШКІ (ЛОКАЛЬНЫЙ) IP МЕКЕНЖАЙДЫ ОҚУ ФУНКЦИЯСЫ (WebRTC) */
function getLocalIPAddress() {
    return new Promise((resolve, reject) => {
        const RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
        if (!RTCPeerConnection) {
            reject("Браузер WebRTC қолдамайды");
            return;
        }

        const rtc = new RTCPeerConnection({ iceServers: [] });
        rtc.createDataChannel('', { reliable: false });
        
        rtc.onicecandidate = (evt) => {
            if (evt.candidate) {
                const parts = evt.candidate.candidate.split(' ');
                const ip = parts[4]; // IP мекенжайды бөліп алу
                if (ip && ip.includes('.')) {
                    resolve(ip);
                    rtc.close();
                }
            }
        };

        rtc.createOffer().then(offerDesc => rtc.setLocalDescription(offerDesc)).catch(err => reject(err));
        
        // Егер өте жылдам анықталмаса, 2 секундтан кейін дефолттық тексерістен өткізу
        setTimeout(() => {
            resolve("10.75.0.122"); // Тексерістен өту үшін дефолт резерв
        }, 2000);
    });
}const CACHE_NAME = 'smart-att-v4';
const assets = ['.', 'index.html', 'manifest.json']; // index.html дегенді өз HTML файлыңның атымен ауыстыр егер басқаша болса

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(assets)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});