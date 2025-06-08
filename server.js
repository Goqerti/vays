// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const TelegramBot = require('node-telegram-bot-api');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Fayl yolları
const DB_FILE = path.join(__dirname, 'sifarişlər.txt');
const USERS_FILE = path.join(__dirname, 'users.txt');
const PERMISSIONS_FILE = path.join(__dirname, 'permissions.json');
const CHAT_HISTORY_FILE = path.join(__dirname, 'chat_history.txt');


// --- Telegram Botunun Qurulması ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
let bot;
if (token && chatId) {
    bot = new TelegramBot(token, { polling: false });
    console.log('Telegram botu aktivdir.');
} else {
    console.warn('Telegram bot token və ya chat ID təyin edilməyib. Loglar göndərilməyəcək.');
}

const sendTelegramLog = (message) => {
    if (bot && chatId) {
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' }).catch(error => {
            console.error('Telegram-a log göndərilərkən xəta:', error.code, error.response?.body);
        });
    }
};

const formatLogMessage = (user, action) => {
    const now = new Date();
    const date = now.toLocaleDateString('az-AZ');
    const time = now.toLocaleTimeString('az-AZ');
    return `❗Diqqət:\n🚹 <b>İstifadəçi:</b> ${user.displayName || user.username} (${user.role || 'N/A'})\n⏳ <b>Tarix:</b> ${date}\n⏳ <b>Saat:</b> ${time}\n📝 <b>Hərəkət:</b> ${action}`;
};


// --- Mail Xidmətinin Qurulması ---
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: parseInt(process.env.EMAIL_PORT || "587") === 465, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// --- Middleware ---
const sessionParser = session({
    secret: 'super-gizli-ve-unikal-acar-sozunuzu-bura-yazin-mütləq-dəyişin!',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
});
app.use(sessionParser);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


// --- Helper Functions ---
const getUserCredentials = () => {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            const initialUsers = [
                'said:owner123:owner:Səid:said.orucov.92@mail.ru',
                'finance_user:finance123:finance:Finance:finance.user@example.com',
                'ilkin:sales123:sales_manager:İlkin:ilkin.user@example.com',
                'sales2:sales456:sales_manager:Sales 2:sales2.user@example.com',
                'leyaqet:coord123:coordinator:Ləyaqət:leyaqet.user@example.com',
                'ibrahim:reserv123:reservation:İbrahim:ibrahim.user@example.com'
            ].join('\n') + '\n';
            fs.writeFileSync(USERS_FILE, initialUsers, 'utf-8');
        }
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        const lines = data.trim().split('\n').filter(line => !line.startsWith('#') && line.trim() !== '');
        const users = {};
        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length === 5) {
                const [username, password, role, displayName, email] = parts;
                users[username.trim()] = { password: password.trim(), role: role.trim(), displayName: displayName.trim(), email: email.trim() };
            }
        });
        return users;
    } catch (error) { return {}; }
};

const readOrdersFromFile = () => {
    try {
        if (!fs.existsSync(DB_FILE)) return [];
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        if (data.trim() === '') return [];
        return data.trim().split('\n').map(line => JSON.parse(line)).filter(Boolean);
    } catch { return []; }
};

const writeAllOrdersToFile = (orders) => {
    fs.writeFileSync(DB_FILE, orders.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf-8');
};

const calculateGelir = (order) => {
    const alishAmount = order.alish?.amount || 0;
    const satishAmount = order.satish?.amount || 0;
    if (order.alish?.currency === order.satish?.currency) {
        return { amount: parseFloat((satishAmount - alishAmount).toFixed(2)), currency: order.satish.currency };
    }
    return { amount: 0, currency: 'N/A', note: 'Fərqli valyutalar' };
};
const readPermissionsFromFile = () => {
    try {
        if (!fs.existsSync(PERMISSIONS_FILE)) return {};
        const data = fs.readFileSync(PERMISSIONS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch { return {}; }
};
const writePermissionsToFile = (permissions) => {
    fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(permissions, null, 2), 'utf-8');
};
const readChatHistory = () => {
    if (!fs.existsSync(CHAT_HISTORY_FILE)) return [];
    const data = fs.readFileSync(CHAT_HISTORY_FILE, 'utf-8');
    if (data.trim() === '') return [];
    return data.trim().split('\n').map(line => JSON.parse(line)).filter(Boolean);
};
const appendToChatHistory = (message) => {
    fs.appendFileSync(CHAT_HISTORY_FILE, JSON.stringify(message) + '\n', 'utf-8');
};

// --- Authentication & Page Routes ---
const requireLogin = (req, res, next) => {
    if (req.session && req.session.user) return next();
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ message: 'Sessiya bitib.' });
    return res.redirect('/login.html');
};

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUserCredentials();
    const user = users[username];
    if (user && user.password === password) { 
        req.session.user = { username, role: user.role, displayName: user.displayName };
        sendTelegramLog(formatLogMessage(req.session.user, 'sistemə daxil oldu.'));
        res.redirect('/');
    } else {
        res.redirect('/login.html?error=true');
    }
});

app.get('/logout', (req, res) => {
    if (req.session.user) {
        sendTelegramLog(formatLogMessage(req.session.user, 'sistemdən çıxış etdi.'));
    }
    req.session.destroy(err => {
        if (err) return res.redirect('/?logoutFailed=true');
        res.clearCookie('connect.sid');
        res.redirect('/login.html');
    });
});

app.get('/', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/permissions', (req, res) => res.sendFile(path.join(__dirname, 'public', 'permissions.html')));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'forgot-password.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));

// --- API ---
const apiRouter = express.Router();

// İcazə paneli və şifrə sıfırlama endpointləri (giriş tələb etmir)
apiRouter.post('/verify-owner', (req, res) => {
    const { password } = req.body;
    const users = getUserCredentials();
    const owner = Object.values(users).find(u => u.role === 'owner');
    if (req.session.verifyOwnerAttempts === undefined) {
        req.session.verifyOwnerAttempts = 0;
    }
    if (owner && owner.password === password) {
        req.session.verifyOwnerAttempts = 0; 
        req.session.isOwnerVerified = true; 
        res.status(200).json({ success: true });
    } else {
        req.session.verifyOwnerAttempts++;
        if (req.session.verifyOwnerAttempts >= 3) {
            const intruderInfo = { displayName: 'Naməlum şəxs', role: 'Giriş yoxdur' };
            const actionMessage = `İcazələr Panelinə 3 dəfə səhv parol ilə girişə cəhd etdi.`;
            sendTelegramLog(formatLogMessage(intruderInfo, actionMessage));
            req.session.verifyOwnerAttempts = 0; 
        }
        res.status(401).json({ message: 'Parol yanlışdır' });
    }
});

apiRouter.get('/permissions', (req, res) => res.json(readPermissionsFromFile()));
apiRouter.put('/permissions', (req, res) => {
    if (!req.session.isOwnerVerified) {
        return res.status(403).json({ message: 'Bu əməliyyatı etmək üçün təsdiqlənməlisiniz.' });
    }
    const newPermissions = req.body;
    writePermissionsToFile(newPermissions);
    sendTelegramLog(formatLogMessage({displayName: "Owner", role: "owner"}, `bütün rollar üçün icazələri yenilədi.`));
    res.status(200).json({ message: 'İcazələr uğurla yadda saxlandı.' });
});

apiRouter.post('/forgot-password', (req, res) => {
    const { username } = req.body;
    const users = getUserCredentials();
    const user = users[username];

    if (!user || !user.email) {
        return res.status(404).json({ message: "Bu istifadəçi adı ilə əlaqəli e-poçt ünvanı tapılmadı." });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000;
    req.session.otpData = { username, otp, expires };

    const mailOptions = {
        from: `"Azerweys Admin Panel" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Şifrə Sıfırlama Kodu',
        html: `<p>Salam, ${user.displayName}.</p><p>Şifrənizi sıfırlamaq üçün təsdiq kodunuz: <b>${otp}</b></p><p>Bu kod 10 dəqiqə ərzində etibarlıdır.</p>`
    };
    
    console.log(`OTP kodu göndərilir: ${user.email} | Kod: ${otp}`);
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error("!!! MAIL GÖNDƏRMƏ XƏTASI !!!\n", error);
            return res.status(500).json({ message: "OTP kodu göndərilərkən xəta baş verdi. Sistem admini ilə əlaqə saxlayın." });
        }
        console.log('Mail uğurla göndərildi: %s', info.messageId);
        res.status(200).json({ message: `Təsdiq kodu ${user.email} ünvanına göndərildi.` });
    });
});

apiRouter.post('/reset-password', (req, res) => {
    const { username, otp, newPassword } = req.body;
    const otpData = req.session.otpData;

    if (!otpData || otpData.username !== username || otpData.otp !== otp) {
        return res.status(400).json({ message: "OTP kod yanlışdır." });
    }
    if (Date.now() > otpData.expires) {
        return res.status(400).json({ message: "OTP kodunun vaxtı bitib." });
    }
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "Yeni şifrə ən az 6 simvoldan ibarət olmalıdır." });
    }

    try {
        const users = getUserCredentials();
        if (!users[username]) return res.status(404).json({ message: "İstifadəçi tapılmadı." });
        
        users[username].password = newPassword; 
        
        const lines = Object.entries(users).map(([u, d]) => `${u}:${d.password}:${d.role}:${d.displayName}:${d.email}`);
        fs.writeFileSync(USERS_FILE, lines.join('\n') + '\n', 'utf-8');
        
        delete req.session.otpData; 
        
        sendTelegramLog(formatLogMessage({displayName: username, role: users[username].role}, `mail vasitəsilə şifrəsini yenilədi.`));
        res.status(200).json({ message: "Şifrəniz uğurla yeniləndi. Giriş səhifəsinə yönləndirilirsiniz..." });

    } catch (error) {
        res.status(500).json({ message: "Şifrə yenilənərkən server xətası baş verdi." });
    }
});


// Qalan API endpointləri üçün giriş tələb olunur
apiRouter.use(requireLogin); 

apiRouter.get('/user/me', (req, res) => res.json(req.session.user));
apiRouter.get('/user/permissions', (req, res) => {
    const { role } = req.session.user;
    if (role === 'owner') return res.json({ canEditOrder: true, canDeleteOrder: true, canEditFinancials: true });
    res.json(readPermissionsFromFile()[role] || {});
});

apiRouter.get('/orders', (req, res) => {
    let orders = readOrdersFromFile();
    res.json(orders.map(o => ({ ...o, gelir: calculateGelir(o) })));
});

apiRouter.post('/orders', (req, res) => {
    try {
        const newOrderData = req.body;
        if (!newOrderData.turist) { return res.status(400).json({ message: 'Turist məlumatı mütləq daxil edilməlidir.' }); }
        const orders = readOrdersFromFile();
        let nextSatisNo = 1695;
        if (orders.length > 0) {
            const maxSatisNo = Math.max(...orders.map(o => parseInt(o.satisNo)).filter(num => !isNaN(num)), 0);
            nextSatisNo = maxSatisNo >= 1695 ? maxSatisNo + 1 : 1695;
        }
        const orderToSave = {
            satisNo: String(nextSatisNo),
            creationTimestamp: new Date().toISOString(),
            createdBy: req.session.user.username,
            ...newOrderData,
            paymentStatus: newOrderData.paymentStatus || 'Ödənilməyib',
            paymentDueDate: newOrderData.paymentDueDate || null
        };
        orders.push(orderToSave);
        writeAllOrdersToFile(orders);
        const actionMessage = `yeni sifariş (№${orderToSave.satisNo}) yaratdı: <b>${orderToSave.turist}</b>`;
        sendTelegramLog(formatLogMessage(req.session.user, actionMessage));
        res.status(201).json({ ...orderToSave, gelir: calculateGelir(orderToSave) });
    } catch (error) {
        res.status(500).json({ message: 'Serverdə daxili xəta baş verdi.' });
    }
});

apiRouter.put('/orders/:satisNo', (req, res) => {
    const { role } = req.session.user;
    const permissions = readPermissionsFromFile();
    const userPermissions = permissions[role] || {};

    if (role !== 'owner' && !userPermissions.canEditOrder) {
        return res.status(403).json({ message: 'Sifarişi redaktə etməyə icazəniz yoxdur.' });
    }
    try {
        const { satisNo } = req.params;
        const updatedOrderData = req.body;
        let orders = readOrdersFromFile();
        const orderIndex = orders.findIndex(o => String(o.satisNo) === String(satisNo));
        if (orderIndex === -1) return res.status(404).json({ message: `Sifariş (${satisNo}) tapılmadı.` });

        const orderToUpdate = { ...orders[orderIndex] };
        const canEditFinancials = role === 'owner' || role === 'finance' || (userPermissions.canEditFinancials);

        if (!canEditFinancials) {
            delete updatedOrderData.alish;
            delete updatedOrderData.satish;
            delete updatedOrderData.detailedCosts;
            if (updatedOrderData.hotels) {
                updatedOrderData.hotels = updatedOrderData.hotels.map(h => {
                    const { qiymet, ...rest } = h; return rest;
                });
            }
        }
        Object.assign(orderToUpdate, updatedOrderData);
        orderToUpdate.satisNo = satisNo;
        orders[orderIndex] = orderToUpdate;
        writeAllOrdersToFile(orders);
        sendTelegramLog(formatLogMessage(req.session.user, `sifarişə (№${satisNo}) düzəliş etdi.`));
        res.status(200).json({ message: 'Sifariş uğurla yeniləndi.'});
    } catch (error) {
        res.status(500).json({ message: 'Serverdə daxili xəta baş verdi.' });
    }
});

apiRouter.delete('/orders/:satisNo', (req, res) => {
    const { role } = req.session.user;
    const permissions = readPermissionsFromFile();
    const userPermissions = permissions[role] || {};
    
    if (role !== 'owner' && !userPermissions.canDeleteOrder) {
        return res.status(403).json({ message: 'Bu əməliyyatı etməyə icazəniz yoxdur.' });
    }
    try {
        let orders = readOrdersFromFile();
        const orderToDelete = orders.find(o => String(o.satisNo) === req.params.satisNo);
        if (!orderToDelete) return res.status(404).json({ message: `Sifariş tapılmadı.` });
        const updatedOrders = orders.filter(order => String(order.satisNo) !== req.params.satisNo);
        writeAllOrdersToFile(updatedOrders);
        sendTelegramLog(formatLogMessage(req.session.user, `sifarişi (№${orderToDelete.satisNo}) sildi.`));
        res.status(200).json({ message: `Sifariş uğurla silindi.` });
    } catch (error) {
        res.status(500).json({ message: 'Sifariş silinərkən xəta.' });
    }
});


apiRouter.get('/reservations', (req, res) => {
    try {
        const orders = readOrdersFromFile();
        let allReservations = [];
        orders.forEach(order => {
            if (Array.isArray(order.hotels)) {
                order.hotels.forEach(hotel => {
                    if (hotel.otelAdi && hotel.girisTarixi && hotel.cixisTarixi) {
                        allReservations.push({
                            satisNo: order.satisNo,
                            turist: order.turist || '-',
                            otelAdi: hotel.otelAdi,
                            girisTarixi: hotel.girisTarixi,
                            cixisTarixi: hotel.cixisTarixi,
                            adultGuests: order.adultGuests || 0,
                            childGuests: order.childGuests || 0,
                        });
                    }
                });
            }
        });
        res.json(allReservations);
    } catch (error) {
        res.status(500).json({ message: 'Rezervasiyalar gətirilərkən xəta baş verdi.' });
    }
});

apiRouter.get('/reports', (req, res) => {
    try {
        let orders = readOrdersFromFile();
        const report = {
            totalAlish: { AZN: 0, USD: 0, EUR: 0 },
            totalSatish: { AZN: 0, USD: 0, EUR: 0 },
            totalGelir: { AZN: 0, USD: 0, EUR: 0 },
            byHotel: {}
        };
        orders.forEach(order => {
            const gelir = calculateGelir(order);
            if (order.alish?.currency) report.totalAlish[order.alish.currency] += (order.alish.amount || 0);
            if (order.satish?.currency) report.totalSatish[order.satish.currency] += (order.satish.amount || 0);
            if (gelir?.currency && !gelir.note) report.totalGelir[gelir.currency] += (gelir.amount || 0);
            if (Array.isArray(order.hotels)) {
                order.hotels.forEach(hotel => {
                    const currentHotelName = hotel.otelAdi?.trim() || "Digər";
                    if (!report.byHotel[currentHotelName]) {
                        report.byHotel[currentHotelName] = { ordersCount: 0, alish: { AZN: 0, USD: 0, EUR: 0 }, satish: { AZN: 0, USD: 0, EUR: 0 }, gelir: { AZN: 0, USD: 0, EUR: 0 } };
                    }
                    report.byHotel[currentHotelName].ordersCount++;
                    if (order.alish?.currency) report.byHotel[currentHotelName].alish[order.alish.currency] += (order.alish.amount || 0);
                    if (order.satish?.currency) report.byHotel[currentHotelName].satish[order.satish.currency] += (order.satish.amount || 0);
                    if (gelir?.currency && !gelir.note) report.byHotel[currentHotelName].gelir[gelir.currency] += (gelir.amount || 0);
                });
            }
        });
        res.json(report);
    } catch (error) {
        res.status(500).json({ message: 'Hesabat hazırlanarkən serverdə xəta.', details: error.message });
    }
});

apiRouter.put('/orders/:satisNo/note', (req, res) => {
    try {
        const { satisNo } = req.params;
        const { qeyd } = req.body;
        if (typeof qeyd === 'undefined') return res.status(400).json({ message: 'Qeyd mətni təqdim edilməyib.' });
        let orders = readOrdersFromFile();
        const orderIndex = orders.findIndex(o => String(o.satisNo) === String(satisNo));
        if (orderIndex === -1) return res.status(404).json({ message: `Sifariş (${satisNo}) tapılmadı.` });
        orders[orderIndex].qeyd = qeyd || '';
        writeAllOrdersToFile(orders);
        res.status(200).json({ message: `Qeyd uğurla yeniləndi.` });
    } catch (error) {
        res.status(500).json({ message: 'Qeyd yenilənərkən daxili server xətası.' });
    }
});

apiRouter.get('/orders/search/rez/:rezNomresi', (req, res) => {
    try {
        const { rezNomresi } = req.params;
        if (!rezNomresi?.trim()) return res.status(400).json({ message: 'Rezervasiya nömrəsi daxil edilməyib.' });
        const orders = readOrdersFromFile();
        const order = orders.find(o => String(o.rezNomresi).toLowerCase() === String(rezNomresi).toLowerCase());
        if (order) res.json({...order, gelir: calculateGelir(order)}); 
        else res.status(404).json({ message: `Bu rezervasiya nömrəsi ilə sifariş tapılmadı.` });
    } catch (error) {
        res.status(500).json({ message: 'Sifariş axtarılarkən daxili server xətası.' });
    }
});

// Borcları gətirmək üçün API endpointi
apiRouter.get('/debts', (req, res) => {
    try {
        const allOrders = readOrdersFromFile();
        let debts = allOrders.filter(order => 
            order.xariciSirket && (!order.paymentStatus || order.paymentStatus === 'Ödənilməyib')
        );

        const { company } = req.query;
        if (company) {
            debts = debts.filter(d =>
                d.xariciSirket.toLowerCase().includes(company.toLowerCase())
            );
        }

        res.json(debts);
    } catch (error) {
        res.status(500).json({ message: 'Borclar siyahısı gətirilərkən xəta baş verdi.' });
    }
});


apiRouter.get('/notifications', (req, res) => {
    try {
        const orders = readOrdersFromFile();
        const notifications = [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(now.getDate() + 3);

        orders.forEach(order => {
            if (!order.hotels || order.hotels.length === 0) return;
            const earliestCheckIn = order.hotels
                .map(h => h.girisTarixi ? new Date(h.girisTarixi) : null)
                .filter(Boolean)
                .sort((a, b) => a - b)[0];

            if (!earliestCheckIn) return;

            if (earliestCheckIn >= now && earliestCheckIn <= threeDaysFromNow) {
                let problemMessage = '';
                const hasIncompleteHotel = order.hotels.some(h => !h.otelAdi || !h.girisTarixi || !h.cixisTarixi);
                if (hasIncompleteHotel) problemMessage += 'Otel məlumatları natamamdır. ';
                const hasIncompleteTransport = !order.transport || !order.transport.surucuMelumatlari;
                if(hasIncompleteTransport) problemMessage += 'Transport məlumatları natamamdır.';
                if (problemMessage) {
                    notifications.push({
                        satisNo: order.satisNo,
                        turist: order.turist,
                        girisTarixi: earliestCheckIn.toLocaleDateString('az-AZ'),
                        problem: problemMessage.trim()
                    });
                }
            }
        });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: "Bildirişləri gətirmək mümkün olmadı." });
    }
});

app.use('/api', apiRouter);

const initializeDBFile = () => {
    try {
        if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '', 'utf-8');
        fs.accessSync(DB_FILE, fs.constants.W_OK);
        if (!fs.existsSync(PERMISSIONS_FILE)) {
            const defaultPermissions = {
              "sales_manager": { "canEditOrder": true, "canDeleteOrder": false, "canEditFinancials": false },
              "coordinator": { "canEditOrder": false, "canDeleteOrder": false, "canEditFinancials": false },
              "reservation": { "canEditOrder": true, "canDeleteOrder": false, "canEditFinancials": false },
              "finance": { "canEditOrder": true, "canDeleteOrder": false, "canEditFinancials": true }
            };
            writePermissionsToFile(defaultPermissions);
            console.log(`'${PERMISSIONS_FILE}' faylı yaradıldı.`);
        }
        if (!fs.existsSync(CHAT_HISTORY_FILE)) {
            fs.writeFileSync(CHAT_HISTORY_FILE, '', 'utf-8');
            console.log(`'${CHAT_HISTORY_FILE}' faylı yaradıldı.`);
        }
    } catch (error) {
        console.error(`KRİTİK XƏTA: Fayllar yaradılarkən və ya oxunarkən problem yarandı.`, error);
    }
};

const server = app.listen(PORT, () => {
    initializeDBFile();
    getUserCredentials();
    console.log(`Server http://localhost:${PORT} ünvanında işləyir`);
});

const wss = new WebSocket.Server({ noServer: true });
const clients = new Map();

wss.on('connection', (ws, request) => {
    const user = request.session.user;
    const clientId = uuidv4();
    clients.set(clientId, { ws, user });
    console.log(`${user.displayName} chat-a qoşuldu.`);

    const history = readChatHistory().slice(-50);
    ws.send(JSON.stringify({ type: 'history', data: history }));

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            const messageData = {
                id: uuidv4(),
                sender: user.displayName,
                role: user.role,
                text: parsedMessage.text,
                timestamp: new Date().toISOString()
            };
            appendToChatHistory(messageData);
            for (const client of clients.values()) {
                client.ws.send(JSON.stringify({ type: 'message', data: messageData }));
            }
        } catch (e) {
            console.error("Gələn mesaj parse edilə bilmədi:", message);
        }
    });

    ws.on('close', () => {
        clients.delete(clientId);
        console.log(`${user.displayName} chat-dan ayrıldı.`);
    });
});

server.on('upgrade', (request, socket, head) => {
    sessionParser(request, {}, () => {
        if (!request.session.user) {
            socket.destroy();
            return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });
});