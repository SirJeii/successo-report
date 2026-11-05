/**
 * SuccessoReport — Store Issue Reporting, Fixer Dispatch & Approval System
 * -------------------------------------------------------------------------
 * Flow:
 *   1. Store Account Reports (Picture + Caption + Priority)
 *      -> Fixer Account Notified (via SabayKonekta SMS + App Notification)
 *      -> SuperAdmin Notified
 *   2. Fixer Account Fixes (Uploads Picture of Fix + Date & Time)
 *      -> Store Account Notified for Legitimacy Approval
 *   3. Store Account Approves (If Legit, with Date & Time)
 *      -> SuperAdmin Notified (via SabayKonekta SMS + App Notification)
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ==========================================================================
   1. FIREBASE & STORAGE CONFIGURATION
   ========================================================================== */
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAQ9sQMgYTX3IGcnT2QVRdSL93xu0ObXzQ",
  authDomain: "sample-bf98e.firebaseapp.com",
  projectId: "sample-bf98e",
  storageBucket: "sample-bf98e.firebasestorage.app",
  messagingSenderId: "965792913340",
  appId: "1:965792913340:web:7b51ca60c4d5b193023db9"
};

const LS_KEYS = {
  SESSION: "successo_active_session_v2",
  STORES: "successo_stores_v2",
  USERS: "successo_users_v2",
  REPORTS: "successo_reports_v2",
  NOTIFS: "successo_notifs_v2",
  SMS_LOGS: "successo_sms_logs_v2",
  SETTINGS: "successo_settings_v2"
};

const COLLECTIONS = {
  STORES: "successo_stores_v2",
  USERS: "successo_users_v2",
  REPORTS: "successo_reports_v2",
  NOTIFS: "successo_notifications_v2",
  SMS_LOGS: "successo_sms_logs_v2",
  SETTINGS: "successo_settings_v2",
  SABAYKONEKTA_MESSAGES: "messages"
};

let db = null;

/* ==========================================================================
   2. DEFAULT STORES, USERS & SAMPLE REPORTS
   ========================================================================== */
const DEFAULT_STORES = [
  {
    id: "store_main",
    code: "MAIN",
    name: "Successo Store - Main Branch",
    address: "Level 1, Bonifacio High Street, BGC, Taguig City",
    phone: "+639170000002",
    contactPerson: "Branch Operations Lead",
    status: "active",
    createdAt: "2026-11-01T08:00:00.000Z"
  },
  {
    id: "store_makati",
    code: "MAKATI",
    name: "Successo Store - Makati Branch",
    address: "Ground Floor, Glorietta 4, Ayala Center, Makati City",
    phone: "+639170000003",
    contactPerson: "Branch Shift Supervisor",
    status: "active",
    createdAt: "2026-11-01T08:05:00.000Z"
  }
];

const DEFAULT_USERS = [
  {
    id: "user_superadmin",
    username: "superadmin",
    password: "superadmin",
    role: "superadmin",
    displayName: "System SuperAdmin",
    phone: "+639170000001",
    createdAt: "2026-11-01T08:00:00.000Z"
  },
  {
    id: "user_store1",
    username: "store1",
    password: "store1",
    role: "store",
    storeId: "store_main",
    storeName: "Successo Store - Main Branch",
    displayName: "Successo Store - Main Branch",
    phone: "+639170000002",
    createdAt: "2026-11-01T08:05:00.000Z"
  },
  {
    id: "user_store2",
    username: "store2",
    password: "store2",
    role: "store",
    storeId: "store_makati",
    storeName: "Successo Store - Makati Branch",
    displayName: "Successo Store - Makati Branch",
    phone: "+639170000003",
    createdAt: "2026-11-01T08:08:00.000Z"
  },
  {
    id: "user_fixer1",
    username: "fixer1",
    password: "fixer1",
    role: "fixer",
    displayName: "Juan Dela Cruz (Lead Maintenance Tech)",
    phone: "+639170000004",
    createdAt: "2026-11-01T08:10:00.000Z"
  },
  {
    id: "user_fixer2",
    username: "fixer2",
    password: "fixer2",
    role: "fixer",
    displayName: "Pedro Santos (Electrical & HVAC Tech)",
    phone: "+639170000005",
    createdAt: "2026-11-01T08:12:00.000Z"
  }
];

const DEFAULT_SETTINGS = {
  smsEndpoint: "https://sabaykonekta.netlify.app/api/v1/send-sms",
  smsApiKey: "",
  smsGatewayId: "default_gateway",
  smsFirestoreBridge: true,
  tgBotToken: "",
  tgChatId: ""
};

function createFlatSampleSvg(bgColor, titleText, subText) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
    <rect width="640" height="480" fill="${bgColor}"/>
    <rect x="36" y="36" width="568" height="408" fill="none" stroke="#ffffff" stroke-width="6"/>
    <text x="320" y="215" font-family="Inter, sans-serif" font-size="28" font-weight="800" fill="#ffffff" text-anchor="middle">${titleText}</text>
    <text x="320" y="260" font-family="monospace" font-size="17" font-weight="600" fill="#f1f5f9" text-anchor="middle">${subText}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEFAULT_REPORTS = [
  // STAGE 1 SAMPLE: Store Reported -> Waiting for Maintenance Technician to Repair
  {
    id: "REP-1001",
    storeId: "user_store1",
    storeUsername: "store1",
    storeName: "Successo Store - Main Branch",
    caption: "Broken Display Chiller Door Seal — rubber gasket on the right door is torn and cold air is leaking out.",
    priority: "high",
    status: "pending", // pending | awaiting_approval | approved | rejected
    assignedFixerUsername: "fixer1",
    assignedFixerName: "Juan Dela Cruz (Lead Maintenance Tech)",
    assignedFixerPhone: "+639170000004",
    brokenImageUrl: createFlatSampleSvg("#dc2626", "BROKEN: CHILLER DOOR SEAL", "Store 1 Photo • Telegram Hosted"),
    brokenTelegramFileId: "tg_broken_1001",
    reportedAt: "2026-11-05T08:30:00.000Z",
    reportedDateStr: "2026-11-05",
    reportedTimeStr: "08:30",
    fixerNotifiedCount: 1,
    lastFixerNotifiedAt: "2026-11-05 08:30 (Auto SMS + App)",
    fixImageUrl: "",
    fixTelegramFileId: "",
    fixNotes: "",
    fixedDate: "",
    fixedTime: "",
    fixedAt: "",
    fixedByUsername: "",
    fixedByName: "",
    approvedDate: "",
    approvedTime: "",
    approvedAt: "",
    approvedByUsername: "",
    approvalRemarks: ""
  },
  // STAGE 2 SAMPLE: Technician Repaired (Uploaded Photo + Date & Time) -> Waiting for Store 1 Approval (If Legit)
  {
    id: "REP-1002",
    storeId: "user_store1",
    storeUsername: "store1",
    storeName: "Successo Store - Main Branch",
    caption: "Broken Espresso Machine Steam Valve — steam pressure knob is stuck and leaking hot water.",
    priority: "urgent",
    status: "awaiting_approval",
    assignedFixerUsername: "fixer1",
    assignedFixerName: "Juan Dela Cruz (Lead Maintenance Tech)",
    assignedFixerPhone: "+639170000004",
    brokenImageUrl: createFlatSampleSvg("#b91c1c", "BROKEN: STEAM VALVE LEAK", "Store 1 Photo • Telegram Hosted"),
    brokenTelegramFileId: "tg_broken_1002",
    reportedAt: "2026-11-05T09:00:00.000Z",
    reportedDateStr: "2026-11-05",
    reportedTimeStr: "09:00",
    fixerNotifiedCount: 1,
    lastFixerNotifiedAt: "2026-11-05 09:00 (Auto SMS + App)",
    fixImageUrl: createFlatSampleSvg("#d97706", "REPAIRED: NEW BRASS STEAM VALVE", "Technician Proof • 2026-11-05 10:30"),
    fixTelegramFileId: "tg_fixed_1002",
    fixNotes: "Replaced broken steam valve assembly and O-ring seal. Tested pressure at 1.5 bar.",
    fixedDate: "2026-11-05",
    fixedTime: "10:30",
    fixedAt: "2026-11-05T10:30:00.000Z",
    fixedByUsername: "fixer1",
    fixedByName: "Juan Dela Cruz (Lead Maintenance Tech)",
    approvedDate: "",
    approvedTime: "",
    approvedAt: "",
    approvedByUsername: "",
    approvalRemarks: ""
  },
  // STAGE 3 SAMPLE: Store Approved Repair as Legit (with Date & Time) -> SuperAdmin Notified
  {
    id: "REP-1003",
    storeId: "user_store2",
    storeUsername: "store2",
    storeName: "Successo Store - Makati Branch",
    caption: "Broken Front Cashier Counter Light — ballast burnt out above POS terminal #1.",
    priority: "low",
    status: "approved",
    assignedFixerUsername: "fixer2",
    assignedFixerName: "Pedro Santos (Electrical & HVAC Tech)",
    assignedFixerPhone: "+639170000005",
    brokenImageUrl: createFlatSampleSvg("#475569", "BROKEN: CASHIER TUBE LIGHT", "Store 2 Photo • Telegram Hosted"),
    brokenTelegramFileId: "tg_broken_1003",
    reportedAt: "2026-11-04T13:15:00.000Z",
    reportedDateStr: "2026-11-04",
    reportedTimeStr: "13:15",
    fixerNotifiedCount: 1,
    lastFixerNotifiedAt: "2026-11-04 13:15 (Auto SMS + App)",
    fixImageUrl: createFlatSampleSvg("#16a34a", "REPAIRED: NEW LED PANEL INSTALLED", "Technician Proof • 2026-11-04 15:40"),
    fixTelegramFileId: "tg_fixed_1003",
    fixNotes: "Installed new 24W flat LED fixture and rewired starter switch.",
    fixedDate: "2026-11-04",
    fixedTime: "15:40",
    fixedAt: "2026-11-04T15:40:00.000Z",
    fixedByUsername: "fixer2",
    fixedByName: "Pedro Santos (Electrical & HVAC Tech)",
    approvedDate: "2026-11-04",
    approvedTime: "16:05",
    approvedAt: "2026-11-04T16:05:00.000Z",
    approvedByUsername: "store2",
    approvalRemarks: "Legit repair! Light is bright and working properly. SuperAdmin notified."
  }
];

let state = {
  currentUser: null,
  stores: [],
  users: [],
  reports: [],
  notifications: [],
  smsLogs: [],
  settings: { ...DEFAULT_SETTINGS },
  activeTab: "panel-dashboard",
  statusFilter: "all",
  priorityFilter: "all",
  searchQuery: "",
  userRoleFilter: "all",
  userSearchQuery: "",
  storeStatusFilter: "all",
  storeSearchQuery: "",
  pendingReportPhotoDataUrl: "",
  pendingReportPhotoBlob: null,
  pendingFixPhotoDataUrl: "",
  pendingFixPhotoBlob: null
};

/* ==========================================================================
   3. LOCAL STORAGE & FIRESTORE HYBRID PERSISTENCE
   ========================================================================== */
function loadLocalState() {
  try {
    const savedStores = JSON.parse(localStorage.getItem(LS_KEYS.STORES) || "null");
    state.stores = Array.isArray(savedStores) && savedStores.length > 0 ? savedStores : [...DEFAULT_STORES];
    DEFAULT_STORES.forEach(defS => {
      if (!state.stores.some(s => s.id === defS.id)) {
        state.stores.push({ ...defS });
      }
    });
    localStorage.setItem(LS_KEYS.STORES, JSON.stringify(state.stores));

    const savedUsers = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "null");
    state.users = Array.isArray(savedUsers) && savedUsers.length > 0 ? savedUsers : [...DEFAULT_USERS];

    // Ensure all 5 default accounts exist and display names are updated
    DEFAULT_USERS.forEach(defU => {
      const existing = state.users.find(u => u.username.toLowerCase() === defU.username.toLowerCase());
      if (!existing) {
        state.users.push({ ...defU });
      } else {
        if (existing.displayName && existing.displayName.includes("Fixer")) {
          existing.displayName = defU.displayName;
        }
        if (defU.role === "store" && !existing.storeId) {
          existing.storeId = defU.storeId;
          existing.storeName = defU.storeName;
        }
      }
    });

    // Ensure all store users link to a store
    state.users.forEach(u => {
      if (u.role === "store" && !u.storeId) {
        const matchingStore = state.stores.find(s => s.name === u.displayName) || state.stores[0];
        if (matchingStore) {
          u.storeId = matchingStore.id;
          u.storeName = matchingStore.name;
        }
      }
    });
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(state.users));

    const savedReports = JSON.parse(localStorage.getItem(LS_KEYS.REPORTS) || "null");
    state.reports = Array.isArray(savedReports) && savedReports.length > 0 ? savedReports : [...DEFAULT_REPORTS];
    localStorage.setItem(LS_KEYS.REPORTS, JSON.stringify(state.reports));

    const savedNotifs = JSON.parse(localStorage.getItem(LS_KEYS.NOTIFS) || "null");
    state.notifications = Array.isArray(savedNotifs) ? savedNotifs : [];

    const savedSms = JSON.parse(localStorage.getItem(LS_KEYS.SMS_LOGS) || "null");
    state.smsLogs = Array.isArray(savedSms) ? savedSms : [];

    const savedSettings = JSON.parse(localStorage.getItem(LS_KEYS.SETTINGS) || "null");
    if (savedSettings && typeof savedSettings === "object") {
      state.settings = { ...DEFAULT_SETTINGS, ...savedSettings };
    }

    const savedSession = JSON.parse(localStorage.getItem(LS_KEYS.SESSION) || "null");
    if (savedSession && savedSession.username) {
      const freshUser = state.users.find(u => u.username.toLowerCase() === savedSession.username.toLowerCase());
      if (freshUser) {
        state.currentUser = freshUser;
      }
    }
  } catch (err) {
    console.warn("LocalStorage load error:", err);
    state.users = [...DEFAULT_USERS];
    state.reports = [...DEFAULT_REPORTS];
  }
}

function saveLocalCollection(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn("Could not save to localStorage:", err);
  }
}

async function initFirebaseAndStreams() {
  const connBadge = document.getElementById("db-conn-indicator");
  try {
    const app = getApps().length === 0 ? initializeApp(DEFAULT_FIREBASE_CONFIG) : getApps()[0];
    db = getFirestore(app);

    for (const defaultStore of DEFAULT_STORES) {
      const existing = state.stores.find(s => s.id === defaultStore.id) || defaultStore;
      setDoc(doc(db, COLLECTIONS.STORES, existing.id), existing, { merge: true }).catch(() => { });
    }

    onSnapshot(collection(db, COLLECTIONS.STORES), (snap) => {
      if (!snap.empty) {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        DEFAULT_STORES.forEach(defS => {
          if (!list.some(s => s.id === defS.id)) {
            list.push({ ...defS });
          }
        });
        state.stores = list;
        saveLocalCollection(LS_KEYS.STORES, state.stores);
        renderManageStoresSection();
        populateStoreSelects();
      }
    });

    for (const defaultUser of DEFAULT_USERS) {
      const existing = state.users.find(u => u.username === defaultUser.username) || defaultUser;
      setDoc(doc(db, COLLECTIONS.USERS, existing.id), existing, { merge: true }).catch(() => { });
    }

    onSnapshot(collection(db, COLLECTIONS.USERS), (snap) => {
      if (connBadge) connBadge.textContent = "DB: Firebase Live";
      if (!snap.empty) {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        DEFAULT_USERS.forEach(defU => {
          if (!list.some(u => u.username.toLowerCase() === defU.username.toLowerCase())) {
            list.push({ ...defU });
          }
        });
        state.users = list;
        saveLocalCollection(LS_KEYS.USERS, state.users);
        if (state.currentUser) {
          const updatedMe = state.users.find(u => u.username.toLowerCase() === state.currentUser.username.toLowerCase());
          if (updatedMe) state.currentUser = updatedMe;
        }
        renderQuickSwitchBar();
        renderDashboardUI();
        renderManageStoresSection();
        renderUsersTable();
        populateFixerSelects();
      }
    }, () => {
      if (connBadge) connBadge.textContent = "DB: Local + Sync Mode";
    });

    onSnapshot(collection(db, COLLECTIONS.REPORTS), (snap) => {
      if (!snap.empty) {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.reportedAt || 0) - new Date(a.reportedAt || 0));
        state.reports = list;
        saveLocalCollection(LS_KEYS.REPORTS, state.reports);
        renderDashboardUI();
        renderManageStoresSection();
        renderReportsSection();
        renderRoleActionBanner();
      } else if (state.reports.length > 0) {
        state.reports.forEach(r => {
          setDoc(doc(db, COLLECTIONS.REPORTS, r.id), r, { merge: true }).catch(() => { });
        });
      }
    });

    const qNotifs = query(collection(db, COLLECTIONS.NOTIFS), limit(150));
    onSnapshot(qNotifs, (snap) => {
      if (!snap.empty) {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        state.notifications = list;
        saveLocalCollection(LS_KEYS.NOTIFS, state.notifications);
        renderNotificationsUI();
      }
    });

    const qSms = query(collection(db, COLLECTIONS.SMS_LOGS), limit(100));
    onSnapshot(qSms, (snap) => {
      if (!snap.empty) {
        const list = [];
        snap.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        state.smsLogs = list;
        saveLocalCollection(LS_KEYS.SMS_LOGS, state.smsLogs);
        renderSmsLogsTable();
      }
    });

    onSnapshot(doc(db, COLLECTIONS.SETTINGS, "global"), (docSnap) => {
      if (docSnap.exists()) {
        state.settings = { ...DEFAULT_SETTINGS, ...docSnap.data() };
        saveLocalCollection(LS_KEYS.SETTINGS, state.settings);
        populateSettingsForms();
        updateSidebarIntegrationStatus();
      }
    });
  } catch (err) {
    if (connBadge) connBadge.textContent = "DB: Local Mode";
  }

  window.addEventListener("storage", () => {
    loadLocalState();
    renderAllViews();
  });
}

/* ==========================================================================
   4. TELEGRAM IMAGE HANDLER (sendPhoto + getFile + Canvas Compression)
   ========================================================================== */
async function compressImageFile(file, maxWidth = 1000, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        canvas.toBlob(
          (blob) => resolve({ dataUrl, blob }),
          "image/jpeg",
          quality
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPhotoViaTelegram(blob, dataUrl, captionText) {
  const token = (state.settings.tgBotToken || "").trim();
  const chatId = (state.settings.tgChatId || "").trim();

  if (!token || !chatId) {
    return {
      imageUrl: dataUrl,
      telegramFileId: `tg_local_${Date.now()}`,
      telegramStatus: "Telegram Hosted (Local Cache)"
    };
  }

  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("photo", blob, `successo_${Date.now()}.jpg`);
    formData.append("caption", captionText.slice(0, 1000));

    const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: formData
    });
    const sendJson = await sendRes.json();

    if (!sendJson.ok || !sendJson.result?.photo) {
      throw new Error(sendJson.description || "Telegram sendPhoto error");
    }

    const photos = sendJson.result.photo;
    const bestPhoto = photos[photos.length - 1];
    const fileId = bestPhoto.file_id;

    let resolvedTelegramUrl = dataUrl;
    try {
      const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
      const fileJson = await fileRes.json();
      if (fileJson.ok && fileJson.result?.file_path) {
        resolvedTelegramUrl = `https://api.telegram.org/file/bot${token}/${fileJson.result.file_path}`;
      }
    } catch (fileErr) {
      console.warn("Telegram getFile fallback:", fileErr);
    }

    return {
      imageUrl: dataUrl || resolvedTelegramUrl,
      telegramDirectUrl: resolvedTelegramUrl,
      telegramFileId: fileId,
      telegramStatus: `Telegram File ID: ${fileId.slice(0, 14)}...`
    };
  } catch (err) {
    return {
      imageUrl: dataUrl,
      telegramFileId: `tg_fallback_${Date.now()}`,
      telegramStatus: "Telegram Backup Stored"
    };
  }
}

/* ==========================================================================
   5. SABAYKONEKTA SMS API GATEWAY INTEGRATION
      (https://sabaykonekta.netlify.app/)
   ========================================================================== */
function normalizePhone(phone) {
  if (!phone) return "";
  let clean = String(phone).trim().replace(/[^\d+]/g, "");
  if (clean.startsWith("09") && clean.length === 11) {
    clean = "+63" + clean.slice(1);
  } else if (!clean.startsWith("+") && clean.length > 0) {
    clean = "+" + clean;
  }
  return clean;
}

async function dispatchSabayKonektaSms(recipientPhone, messageText, contextLabel = "Flow Alert") {
  const cleanPhone = normalizePhone(recipientPhone);
  if (!cleanPhone) return { ok: false, status: "No Phone" };

  const endpoint = (state.settings.smsEndpoint || "https://sabaykonekta.netlify.app/api/v1/send-sms").trim();
  const apiKey = (state.settings.smsApiKey || "").trim();
  const gatewayId = (state.settings.smsGatewayId || "default_gateway").trim();
  const useFirestoreBridge = state.settings.smsFirestoreBridge !== false;

  let dispatchStatus = `Dispatched via SabayKonekta (${gatewayId})`;

  if (apiKey) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey
        },
        body: JSON.stringify({
          to: cleanPhone,
          message: messageText,
          gatewayId: gatewayId
        })
      });
      if (response.ok) {
        dispatchStatus = `Sent via SabayKonekta API (${gatewayId})`;
      }
    } catch (err) {
      dispatchStatus = `Queued to SabayKonekta Gateway (${gatewayId})`;
    }
  }

  if (db && useFirestoreBridge) {
    try {
      await addDoc(collection(db, COLLECTIONS.SABAYKONEKTA_MESSAGES), {
        phoneNumber: cleanPhone,
        message: messageText,
        status: "pending",
        gatewayId: gatewayId,
        apiKey: apiKey || "successo_report_bridge",
        appName: "SuccessoReport",
        source: "successo_report",
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString(),
        metadata: {
          segments: Math.ceil(messageText.length / 160) || 1,
          encoding: "GSM-7",
          charCount: messageText.length
        }
      });
    } catch (bridgeErr) { }
  }

  const smsRecord = {
    id: `SMS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    to: cleanPhone,
    message: messageText,
    gatewayId,
    context: contextLabel,
    status: dispatchStatus,
    createdAt: new Date().toISOString()
  };

  state.smsLogs.unshift(smsRecord);
  saveLocalCollection(LS_KEYS.SMS_LOGS, state.smsLogs);
  if (db) {
    setDoc(doc(db, COLLECTIONS.SMS_LOGS, smsRecord.id), smsRecord).catch(() => { });
  }
  renderSmsLogsTable();

  return { ok: true, status: dispatchStatus };
}

/* ==========================================================================
   6. IN-APP NOTIFICATIONS ENGINE
   ========================================================================== */
async function createAppNotification({ targetRoles = [], targetUsernames = [], title, message, reportId = "", priority = "medium" }) {
  const notif = {
    id: `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    targetRoles,
    targetUsernames,
    title,
    message,
    reportId,
    priority,
    readBy: [],
    createdAt: new Date().toISOString(),
    actor: state.currentUser ? state.currentUser.username : "system"
  };

  state.notifications.unshift(notif);
  saveLocalCollection(LS_KEYS.NOTIFS, state.notifications);
  if (db) {
    setDoc(doc(db, COLLECTIONS.NOTIFS, notif.id), notif).catch(() => { });
  }
  renderNotificationsUI();
}

function getMyNotifications() {
  if (!state.currentUser) return [];
  const myRole = state.currentUser.role;
  const myUsername = state.currentUser.username.toLowerCase();

  return state.notifications.filter(n => {
    const roleMatch = Array.isArray(n.targetRoles) && n.targetRoles.includes(myRole);
    const userMatch = Array.isArray(n.targetUsernames) && n.targetUsernames.some(u => u.toLowerCase() === myUsername);
    return roleMatch || userMatch;
  });
}

/* ==========================================================================
   7. AUTHENTICATION & 1-CLICK ROLE SWITCHER
   ========================================================================== */
function handleLogin(usernameInput, passwordInput) {
  const cleanUser = String(usernameInput || "").trim().toLowerCase();
  const cleanPass = String(passwordInput || "").trim();

  const errorBox = document.getElementById("login-error-box");
  if (!cleanUser || !cleanPass) {
    errorBox.textContent = "Please enter both your username and password.";
    errorBox.classList.remove("hidden");
    return;
  }

  const matchedUser = state.users.find(
    u => u.username.toLowerCase() === cleanUser && u.password === cleanPass
  );

  if (!matchedUser) {
    errorBox.textContent = "Invalid credentials. Use superadmin/superadmin, store1/store1, or fixer1/fixer1.";
    errorBox.classList.remove("hidden");
    return;
  }

  errorBox.classList.add("hidden");
  state.currentUser = matchedUser;
  state.statusFilter = "all";
  localStorage.setItem(LS_KEYS.SESSION, JSON.stringify({ username: matchedUser.username }));

  state.activeTab = "panel-dashboard";
  renderAllViews();
  showToast(`Logged in as ${matchedUser.displayName} (${matchedUser.role.toUpperCase()})`, "success");
}

function handleLogout() {
  state.currentUser = null;
  localStorage.removeItem(LS_KEYS.SESSION);
  renderAllViews();
}

const APP_ICONS = {
  dashboard: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/></svg>`,
  store: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`,
  reports: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`,
  createReport: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>`,
  users: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
  settings: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
  check: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
  camera: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
  wrench: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>`,
  shieldCheck: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`,
  send: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>`,
  login: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/></svg>`,
  eye: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`,
  edit: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>`,
  key: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>`,
  trash: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`
};

function getRoleTabs(role) {
  if (role === "superadmin") {
    return [
      { id: "panel-dashboard", label: "Operations Dashboard", shortLabel: "Dashboard", iconSvg: APP_ICONS.dashboard },
      { id: "panel-reports", label: "Store Reports Status", shortLabel: "Reports", iconSvg: APP_ICONS.reports },
      { id: "panel-stores", label: "Manage Stores", shortLabel: "Stores", iconSvg: APP_ICONS.store },
      { id: "panel-users", label: "Manage Users & Technicians", shortLabel: "Users", iconSvg: APP_ICONS.users },
      { id: "panel-settings", label: "SMS & Telegram", shortLabel: "Settings", iconSvg: APP_ICONS.settings }
    ];
  }
  if (role === "store") {
    return [
      { id: "panel-dashboard", label: "Store Dashboard", shortLabel: "Dashboard", iconSvg: APP_ICONS.dashboard },
      { id: "panel-reports", label: "My Reports & Approvals", shortLabel: "My Reports", iconSvg: APP_ICONS.reports },
      { id: "panel-create-report", label: "Report Broken Thing", shortLabel: "Report Issue", iconSvg: APP_ICONS.createReport }
    ];
  }
  return [
    { id: "panel-dashboard", label: "Technician Dashboard", shortLabel: "Dashboard", iconSvg: APP_ICONS.dashboard },
    { id: "panel-reports", label: "Assigned Maintenance Jobs", shortLabel: "Repairs", iconSvg: APP_ICONS.reports }
  ];
}

function switchTab(tabId) {
  if (tabId === "panel-create-report") {
    document.getElementById("dialog-create-report")?.showModal();
    return;
  }

  state.activeTab = tabId;
  document.querySelectorAll(".tab-panel").forEach(panel => {
    if (panel.id === tabId) {
      panel.classList.remove("hidden");
    } else {
      panel.classList.add("hidden");
    }
  });

  document.querySelectorAll(".js-nav-tab").forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

/* ==========================================================================
   8. RENDERING VIEWS, WORKFLOW GUIDE & ROLE ACTION BANNERS
   ========================================================================== */
function renderLoginAccountSelector() {
  const container = document.querySelector(".account-selector-grid");
  if (!container) return;

  container.innerHTML = state.users.map(u => {
    let roleBadge = "";
    let avatarClass = "avatar-store";
    let initials = u.username.slice(0, 2).toUpperCase();

    if (u.role === "superadmin") {
      roleBadge = `<span class="badge badge-purple" style="font-size:0.65rem;">SUPERADMIN</span>`;
      avatarClass = "avatar-superadmin";
      initials = "SA";
    } else if (u.role === "store") {
      roleBadge = `<span class="badge badge-primary" style="font-size:0.65rem;">STORE</span>`;
      avatarClass = "avatar-store";
      const words = (u.displayName || u.username).trim().split(/\s+/);
      initials = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : u.username.slice(0, 2).toUpperCase();
    } else {
      roleBadge = `<span class="badge badge-warning" style="font-size:0.65rem;">TECHNICIAN</span>`;
      avatarClass = "avatar-tech";
      const words = (u.displayName || u.username).trim().split(/\s+/);
      initials = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : u.username.slice(0, 2).toUpperCase();
    }

    return `
      <div class="account-card-item js-quick-login" data-user="${escapeHtml(u.username)}" data-pass="${escapeHtml(u.password)}" title="Sign in as ${escapeHtml(u.displayName)}">
        <div style="display:flex; align-items:center; gap:0.65rem; min-width:0; flex:1;">
          <div class="user-avatar user-avatar-sm ${avatarClass}">${escapeHtml(initials)}</div>
          <div style="min-width:0; flex:1;">
            <div style="font-weight:700; font-size:0.83rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(u.displayName)}</div>
            <div class="mono text-xs text-muted" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(u.username)} / ${escapeHtml(u.password)}</div>
          </div>
        </div>
        <div style="flex-shrink:0;">
          ${roleBadge}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".js-quick-login").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("login-username").value = btn.dataset.user;
      document.getElementById("login-password").value = btn.dataset.pass;
      handleLogin(btn.dataset.user, btn.dataset.pass);
    });
  });
}

function renderQuickSwitchBar() {
  const bar = document.getElementById("quick-switch-bar");
  if (!bar || !state.currentUser) return;

  bar.innerHTML = state.users.map(u => {
    const isMe = u.username.toLowerCase() === state.currentUser.username.toLowerCase();
    const roleTag = u.role === "superadmin" ? "SUPERADMIN" : u.role.toUpperCase();
    return `
      <button
        type="button"
        class="role-switch-chip ${isMe ? 'active' : ''}"
        data-user="${escapeHtml(u.username)}"
        data-pass="${escapeHtml(u.password)}"
        title="Switch to ${escapeHtml(u.displayName)} (${escapeHtml(u.username)}/${escapeHtml(u.password)})"
      >
        [${roleTag}] ${escapeHtml(u.username)}
      </button>
    `;
  }).join("");

  bar.querySelectorAll(".role-switch-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      handleLogin(btn.dataset.user, btn.dataset.pass);
    });
  });
}

function renderRoleActionBanner() {
  const banner = document.getElementById("role-action-banner");
  const stepStore = document.getElementById("flow-guide-store");
  const stepFixer = document.getElementById("flow-guide-fixer");
  const stepApprove = document.getElementById("flow-guide-approve");

  if (!banner || !state.currentUser) return;

  stepStore?.classList.remove("active-role-step");
  stepFixer?.classList.remove("active-role-step");
  stepApprove?.classList.remove("active-role-step");

  const role = state.currentUser.role;
  const myUsername = state.currentUser.username.toLowerCase();

  if (role === "store") {
    stepStore?.classList.add("active-role-step");
    stepApprove?.classList.add("active-role-step");

    const waitingMyApproval = state.reports.filter(
      r => (r.storeUsername || "").toLowerCase() === myUsername && r.status === "awaiting_approval"
    );

    if (waitingMyApproval.length > 0) {
      banner.classList.remove("hidden");
      banner.innerHTML = `
        <div>
          <strong>ACTION REQUIRED (${waitingMyApproval.length} Repaired Report${waitingMyApproval.length > 1 ? 's' : ''}):</strong>
          The Maintenance Technician uploaded proof of repair with Date &amp; Time. Please verify if the repair is legit and click <strong>"Approve Legit Repair"</strong> to notify SuperAdmin!
        </div>
        <button type="button" id="btn-banner-filter-awaiting" class="btn btn-warning btn-sm">
          Show Waiting Approval (${waitingMyApproval.length})
        </button>
      `;
      document.getElementById("btn-banner-filter-awaiting")?.addEventListener("click", () => {
        switchTab("panel-reports");
        setStatusFilter("awaiting_approval");
      });
    } else {
      banner.classList.add("hidden");
    }
  } else if (role === "fixer") {
    stepFixer?.classList.add("active-role-step");
    const needsFix = state.reports.filter(r => r.status === "pending" || r.status === "rejected");
    if (needsFix.length > 0) {
      banner.classList.remove("hidden");
      banner.innerHTML = `
        <div>
          <strong>MAINTENANCE QUEUE (${needsFix.length} Report${needsFix.length > 1 ? 's' : ''} Need Repair):</strong>
          Inspect the Store's broken photo &amp; caption below, then click <strong>"Upload Repair Proof + Date &amp; Time"</strong> to request Store Approval.
        </div>
        <button type="button" id="btn-banner-filter-pending" class="btn btn-warning btn-sm">
          Show Needs Repair (${needsFix.length})
        </button>
      `;
      document.getElementById("btn-banner-filter-pending")?.addEventListener("click", () => {
        setStatusFilter("pending");
      });
    } else {
      banner.classList.add("hidden");
    }
  } else {
    // SuperAdmin
    stepApprove?.classList.add("active-role-step");
    const unfixed = state.reports.filter(r => r.status === "pending" || r.status === "rejected");
    if (unfixed.length > 0) {
      banner.classList.remove("hidden");
      banner.innerHTML = `
        <div>
          <strong>SUPERADMIN DISPATCH (${unfixed.length} Pending Store Report${unfixed.length > 1 ? 's' : ''}):</strong>
          You can click <strong>"Dispatch Technician (SMS + App)"</strong> on any pending report below to dispatch an immediate SabayKonekta SMS &amp; App alert.
        </div>
      `;
    } else {
      banner.classList.add("hidden");
    }
  }
}

function setStatusFilter(status) {
  state.statusFilter = status;
  document.querySelectorAll(".js-status-filter").forEach(b => {
    if (b.dataset.status === status) b.classList.add("active");
    else b.classList.remove("active");
  });
  renderReportsSection();
}

function renderDashboardUI() {
  const container = document.getElementById("role-dashboard-container");
  if (!container || !state.currentUser) return;

  const role = state.currentUser.role;
  const username = state.currentUser.username.toLowerCase();

  if (role === "superadmin") {
    // SUPERADMIN OPERATIONS DASHBOARD
    const totalStores = state.users.filter(u => u.role === "store").length;
    const totalFixers = state.users.filter(u => u.role === "fixer").length;
    const totalReports = state.reports.length;
    const pendingFix = state.reports.filter(r => r.status === "pending" || r.status === "rejected").length;
    const awaitingApproval = state.reports.filter(r => r.status === "awaiting_approval").length;
    const approvedCount = state.reports.filter(r => r.status === "approved").length;
    const resolutionRate = totalReports > 0 ? Math.round((approvedCount / totalReports) * 100) : 100;

    const urgentReports = state.reports.filter(r => (r.status === "pending" || r.status === "rejected") && (r.priority === "urgent" || r.priority === "high"));

    const storesList = state.users.filter(u => u.role === "store").map(st => {
      const storeReports = state.reports.filter(r => (r.storeUsername || "").toLowerCase() === st.username.toLowerCase());
      const openIssues = storeReports.filter(r => r.status === "pending" || r.status === "rejected" || r.status === "awaiting_approval").length;
      return { ...st, storeReportsCount: storeReports.length, openIssues };
    });

    container.innerHTML = `
      <!-- Welcome Hero Banner -->
      <div class="dashboard-welcome-banner">
        <div class="dashboard-user-hero">
          <div class="user-avatar user-avatar-md avatar-superadmin" style="font-size:1.05rem;">SA</div>
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <h2 class="page-title" style="margin-bottom:0;">SuperAdmin Operations Center</h2>
              <span class="badge badge-purple">SYSTEM COMMAND</span>
            </div>
            <p class="text-xs text-muted" style="margin-top:0.25rem;">
              Monitoring ${totalStores} Store Branches &bull; ${totalFixers} Active Technicians &bull; SabayKonekta SMS Gateway Connected
            </p>
          </div>
        </div>
        <div class="btn-group-responsive">
          <button type="button" class="btn btn-primary btn-sm js-dash-nav" data-tab="panel-stores">
            ${APP_ICONS.store}
            <span>Manage Stores</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm js-dash-nav" data-tab="panel-reports">
            ${APP_ICONS.reports}
            <span>All Store Reports</span>
          </button>
        </div>
      </div>

      <!-- SuperAdmin KPI Grid -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Active Store Branches</div>
          <div class="kpi-value" style="color:var(--primary);">${totalStores}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--danger-text);">1. Needs Technician Repair</div>
          <div class="kpi-value" style="color:var(--danger);">${pendingFix}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--warning-text);">2. Awaiting Store Approval</div>
          <div class="kpi-value" style="color:var(--warning);">${awaitingApproval}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--success-text);">3. Legit Resolved Rate</div>
          <div class="kpi-value" style="color:var(--success);">${resolutionRate}%</div>
        </div>
      </div>

      <!-- Two-Column Operational Layout -->
      <div class="dashboard-two-col">
        <!-- Left: Urgent Dispatch Queue & Store Health -->
        <div style="display:flex; flex-direction:column; gap:1.25rem;">
          <!-- Urgent Repair Dispatch Queue -->
          <div class="card" style="margin-bottom:0;">
            <div class="card-header">
              <div style="display:flex; align-items:center; gap:0.45rem;">
                <span class="pulse-indicator" style="background-color:var(--danger);"></span>
                <h3 class="section-title">Urgent Maintenance Dispatch Queue</h3>
              </div>
              <span class="badge badge-danger">${urgentReports.length} Prioritized</span>
            </div>
            ${urgentReports.length === 0 ? `
              <div style="text-align:center; padding:1.75rem 1rem; color:var(--text-muted); font-size:0.875rem;">
                No urgent broken reports pending repair right now. All stores in good condition!
              </div>
            ` : `
              <div style="display:flex; flex-direction:column; gap:0.65rem;">
                ${urgentReports.map(r => `
                  <div class="urgent-queue-item">
                    <div style="min-width:0; flex:1;">
                      <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                        <span class="mono text-xs text-bold" style="color:var(--primary);">${escapeHtml(r.id)}</span>
                        <strong style="font-size:0.875rem;">${escapeHtml(r.storeName)}</strong>
                        ${getPriorityBadgeHtml(r.priority)}
                      </div>
                      <div class="text-xs text-muted" style="margin-top:0.25rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        "${escapeHtml(r.caption)}"
                      </div>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm js-dash-notify-btn" data-id="${escapeHtml(r.id)}" style="flex-shrink:0;">
                      ${APP_ICONS.send}
                      <span>Dispatch Technician</span>
                    </button>
                  </div>
                `).join("")}
              </div>
            `}
          </div>

          <!-- Store Branches Operational Health -->
          <div class="card" style="margin-bottom:0;">
            <div class="card-header">
              <div>
                <h3 class="section-title">Store Branches Status Overview</h3>
                <p class="text-xs text-muted">Real-time status per branch</p>
              </div>
              <button type="button" class="btn btn-outline btn-sm js-dash-nav" data-tab="panel-stores">
                View All Stores &rarr;
              </button>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.65rem;">
              ${storesList.map(st => `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.65rem 0.75rem; background-color:var(--bg-muted); border:1px solid var(--border-color); border-radius:var(--radius-md);">
                  <div style="display:flex; align-items:center; gap:0.65rem; min-width:0;">
                    <div class="user-avatar user-avatar-sm avatar-store">${escapeHtml(st.username.slice(0, 2).toUpperCase())}</div>
                    <div style="min-width:0;">
                      <div style="font-weight:700; font-size:0.875rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(st.displayName)}</div>
                      <div class="mono text-xs text-muted">@${escapeHtml(st.username)} &bull; ${escapeHtml(st.phone)}</div>
                    </div>
                  </div>
                  <div style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">
                    ${st.openIssues > 0
        ? `<span class="badge badge-warning">${st.openIssues} Open Issue${st.openIssues > 1 ? 's' : ''}</span>`
        : `<span class="badge badge-success">100% Operational</span>`}
                    <button type="button" class="btn btn-outline btn-sm js-dash-filter-store" data-store="${escapeHtml(st.username)}" title="View reports for this store">
                      Reports
                    </button>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>

        <!-- Right: Recent Activity Audit Feed & Gateway Status -->
        <div style="display:flex; flex-direction:column; gap:1.25rem;">
          <!-- Gateway / Integration Health -->
          <div class="card" style="margin-bottom:0;">
            <div class="card-header">
              <h3 class="section-title">Operations Integrations</h3>
              <span class="badge badge-success">Active</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.65rem; font-size:0.8125rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background-color:var(--bg-muted); border-radius:var(--radius-sm);">
                <div>
                  <strong>SabayKonekta SMS Gateway</strong>
                  <div class="mono text-xs text-muted">${escapeHtml(state.settings.smsEndpoint)}</div>
                </div>
                <span class="badge badge-primary">SMS Active</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background-color:var(--bg-muted); border-radius:var(--radius-sm);">
                <div>
                  <strong>Telegram Photo Hosting</strong>
                  <div class="mono text-xs text-muted">sendPhoto API &bull; getFile</div>
                </div>
                <span class="badge badge-telegram">Telegram Bot</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem; background-color:var(--bg-muted); border-radius:var(--radius-sm);">
                <div>
                  <strong>Firebase Firestore Database</strong>
                  <div class="mono text-xs text-muted">Cloud DB + Offline LocalStorage</div>
                </div>
                <span class="badge badge-success">Live Sync</span>
              </div>
            </div>
          </div>

          <!-- Recent Operations Activity Feed -->
          <div class="card" style="margin-bottom:0;">
            <div class="card-header">
              <h3 class="section-title">Recent Activity Feed</h3>
              <span class="badge badge-neutral">Live Log</span>
            </div>
            <div class="activity-feed-list">
              ${state.reports.slice(0, 5).map(r => {
          let actionText = `Reported: "${r.caption.slice(0, 40)}..."`;
          if (r.status === "approved") {
            actionText = `Store Approved fix on ${r.approvedDate} (${r.approvedTime})`;
          } else if (r.status === "awaiting_approval") {
            actionText = `Technician uploaded repair proof on ${r.fixedDate} (${r.fixedTime})`;
          }
          return `
                  <div class="activity-feed-item">
                    <div class="activity-icon-badge" style="background-color:${r.status === 'approved' ? 'var(--success)' : r.status === 'awaiting_approval' ? 'var(--warning)' : 'var(--danger)'};">
                      ${r.status === 'approved' ? APP_ICONS.check : r.status === 'awaiting_approval' ? '2' : '1'}
                    </div>
                    <div style="min-width:0; flex:1;">
                      <div style="display:flex; align-items:center; justify-content:space-between; gap:0.25rem;">
                        <strong style="font-size:0.8125rem;">${escapeHtml(r.storeName)}</strong>
                        <span class="mono text-xs text-muted">${escapeHtml(r.id)}</span>
                      </div>
                      <div class="text-xs text-muted" style="margin-top:0.15rem;">
                        ${escapeHtml(actionText)}
                      </div>
                    </div>
                  </div>
                `;
        }).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (role === "store") {
    // STORE ACCOUNT DASHBOARD
    const myReports = state.reports.filter(r => (r.storeUsername || "").toLowerCase() === username);
    const myOpen = myReports.filter(r => r.status === "pending" || r.status === "rejected").length;
    const myAwaitingApproval = myReports.filter(r => r.status === "awaiting_approval");
    const myApproved = myReports.filter(r => r.status === "approved").length;

    container.innerHTML = `
      <!-- Welcome Hero Banner -->
      <div class="dashboard-welcome-banner">
        <div class="dashboard-user-hero">
          <div class="user-avatar user-avatar-md avatar-store">ST</div>
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <h2 class="page-title" style="margin-bottom:0;">${escapeHtml(state.currentUser.displayName)}</h2>
              <span class="badge badge-primary">STORE PORTAL</span>
            </div>
            <p class="text-xs text-muted" style="margin-top:0.25rem;">
              Logged in as @${escapeHtml(state.currentUser.username)} &bull; SMS Alerts to ${escapeHtml(state.currentUser.phone || 'Your Phone')}
            </p>
          </div>
        </div>
        <div class="btn-group-responsive">
          <button type="button" class="btn btn-primary btn-sm js-dash-new-report">
            ${APP_ICONS.createReport}
            <span>Report Broken Thing</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm js-dash-nav" data-tab="panel-reports">
            ${APP_ICONS.reports}
            <span>My Store Reports (${myReports.length})</span>
          </button>
        </div>
      </div>

      <!-- Store KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Store Reports</div>
          <div class="kpi-value" style="color:var(--primary);">${myReports.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--danger-text);">Pending Technician Repair</div>
          <div class="kpi-value" style="color:var(--danger);">${myOpen}</div>
        </div>
        <div class="kpi-card" style="${myAwaitingApproval.length > 0 ? 'border-color:var(--warning); background-color:var(--warning-soft);' : ''}">
          <div class="kpi-label" style="color:var(--warning-text); font-weight:800;">Action: Awaiting My Approval</div>
          <div class="kpi-value" style="color:var(--warning);">${myAwaitingApproval.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--success-text);">Verified &amp; Legit Repairs</div>
          <div class="kpi-value" style="color:var(--success);">${myApproved}</div>
        </div>
      </div>

      <!-- High Priority Approval Callout if Technician uploaded repair -->
      ${myAwaitingApproval.length > 0 ? `
        <div class="card" style="border-top:4px solid var(--warning); margin-bottom:1.25rem;">
          <div class="card-header">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="pulse-indicator" style="background-color:var(--warning);"></span>
              <h3 class="section-title">Repair Completed — Verify Legitimacy &amp; Approve</h3>
            </div>
            <span class="badge badge-warning">${myAwaitingApproval.length} Waiting Approval</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.875rem;">
            ${myAwaitingApproval.map(r => `
              <div style="display:flex; flex-direction:column; gap:0.65rem; padding:0.875rem; background-color:var(--bg-muted); border:1px solid var(--border-color); border-radius:var(--radius-md);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; flex-wrap:wrap;">
                  <span class="mono text-xs text-bold" style="color:var(--primary);">${escapeHtml(r.id)}</span>
                  <span class="mono text-xs text-muted">Repaired by ${escapeHtml(r.fixedByName)} on ${escapeHtml(r.fixedDate)} at ${escapeHtml(r.fixedTime)}</span>
                </div>
                <div style="font-weight:700; font-size:0.875rem;">
                  Issue: "${escapeHtml(r.caption)}"
                </div>
                ${r.fixNotes ? `<div class="text-xs text-muted">Repair Notes: "${escapeHtml(r.fixNotes)}"</div>` : ''}
                <div style="display:flex; gap:0.5rem; margin-top:0.35rem;">
                  <button type="button" class="btn btn-success btn-sm js-dash-approve-btn" data-id="${escapeHtml(r.id)}">
                    ${APP_ICONS.shieldCheck}
                    <span>Approve Legit Repair with Date &amp; Time</span>
                  </button>
                  <button type="button" class="btn btn-outline btn-sm js-dash-view-btn" data-id="${escapeHtml(r.id)}">
                    View Photos
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ''}

      <!-- Recent Reports from this Store -->
      <div class="card" style="margin-bottom:0;">
        <div class="card-header">
          <div>
            <h3 class="section-title">Recent Store Maintenance History</h3>
            <p class="text-xs text-muted">Timeline of issues logged by ${escapeHtml(state.currentUser.displayName)}</p>
          </div>
          <button type="button" class="btn btn-outline btn-sm js-dash-nav" data-tab="panel-reports">
            View All Reports &rarr;
          </button>
        </div>
        ${myReports.length === 0 ? `
          <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted);">
            No issues logged yet. Click below to submit a new maintenance request.
            <div style="margin-top:0.75rem;">
              <button type="button" class="btn btn-primary btn-sm js-dash-new-report">
                ${APP_ICONS.createReport}
                <span>Report Broken Thing</span>
              </button>
            </div>
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
            ${myReports.slice(0, 4).map(r => `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.75rem; background-color:var(--bg-muted); border:1px solid var(--border-color); border-radius:var(--radius-md);">
                <div style="min-width:0; flex:1;">
                  <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                    <span class="mono text-xs text-bold" style="color:var(--primary);">${escapeHtml(r.id)}</span>
                    ${getStatusBadgeHtml(r.status)}
                    ${getPriorityBadgeHtml(r.priority)}
                  </div>
                  <div style="font-weight:600; font-size:0.875rem; margin-top:0.25rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    "${escapeHtml(r.caption)}"
                  </div>
                  <div class="mono text-xs text-muted" style="margin-top:0.15rem;">
                    Reported on ${escapeHtml(r.reportedDateStr)} at ${escapeHtml(r.reportedTimeStr)}
                  </div>
                </div>
                <button type="button" class="btn btn-outline btn-sm js-dash-view-btn" data-id="${escapeHtml(r.id)}">
                  Details
                </button>
              </div>
            `).join("")}
          </div>
        `}
      </div>
    `;
  } else {
    // MAINTENANCE TECHNICIAN ACCOUNT DASHBOARD
    const pendingFixQueue = state.reports.filter(r => r.status === "pending" || r.status === "rejected");
    const myAwaitingApproval = state.reports.filter(r => r.status === "awaiting_approval");
    const myCompleted = state.reports.filter(r => r.status === "approved");

    container.innerHTML = `
      <!-- Welcome Hero Banner -->
      <div class="dashboard-welcome-banner">
        <div class="dashboard-user-hero">
          <div class="user-avatar user-avatar-md avatar-tech">TC</div>
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <h2 class="page-title" style="margin-bottom:0;">Maintenance Technician Workspace</h2>
              <span class="badge badge-warning">MAINTENANCE &amp; REPAIR</span>
            </div>
            <p class="text-xs text-muted" style="margin-top:0.25rem;">
              Logged in as ${escapeHtml(state.currentUser.displayName)} &bull; ${pendingFixQueue.length} Store Reports Need Repair
            </p>
          </div>
        </div>
        <div class="btn-group-responsive">
          <button type="button" class="btn btn-primary btn-sm js-dash-nav" data-tab="panel-reports">
            ${APP_ICONS.reports}
            <span>Open Maintenance Queue (${pendingFixQueue.length})</span>
          </button>
        </div>
      </div>

      <!-- Technician KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card" style="${pendingFixQueue.length > 0 ? 'border-color:var(--danger); background-color:var(--danger-soft);' : ''}">
          <div class="kpi-label" style="color:var(--danger-text); font-weight:800;">1. Stores Needing Repair</div>
          <div class="kpi-value" style="color:var(--danger);">${pendingFixQueue.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--warning-text);">2. Submitted &bull; Awaiting Approval</div>
          <div class="kpi-value" style="color:var(--warning);">${myAwaitingApproval.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--success-text);">3. Verified &amp; Legit Repairs</div>
          <div class="kpi-value" style="color:var(--success);">${myCompleted.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Assigned Jobs</div>
          <div class="kpi-value" style="color:var(--primary);">${state.reports.length}</div>
        </div>
      </div>

      <!-- Immediate Repair Action Queue -->
      <div class="card" style="margin-bottom:0;">
        <div class="card-header">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="pulse-indicator" style="background-color:var(--danger);"></span>
            <h3 class="section-title">Immediate Maintenance Queue (Upload Repair Proof + Date &amp; Time)</h3>
          </div>
          <span class="badge badge-danger">${pendingFixQueue.length} Pending</span>
        </div>
        ${pendingFixQueue.length === 0 ? `
          <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted);">
            Great job! No broken reports currently in the repair queue.
          </div>
        ` : `
          <div style="display:flex; flex-direction:column; gap:0.875rem;">
            ${pendingFixQueue.map(r => `
              <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:0.875rem 1rem; background-color:var(--bg-muted); border:1px solid var(--border-color); border-left:4px solid var(--danger); border-radius:var(--radius-md); flex-wrap:wrap;">
                <div style="min-width:0; flex:1;">
                  <div style="display:flex; align-items:center; gap:0.45rem; flex-wrap:wrap;">
                    <span class="mono text-xs text-bold" style="color:var(--primary);">${escapeHtml(r.id)}</span>
                    <strong style="font-size:0.95rem;">${escapeHtml(r.storeName)}</strong>
                    ${getPriorityBadgeHtml(r.priority)}
                  </div>
                  <div style="font-size:0.875rem; color:var(--text-primary); margin-top:0.35rem;">
                    "${escapeHtml(r.caption)}"
                  </div>
                  <div class="mono text-xs text-muted" style="margin-top:0.2rem;">
                    Reported: ${escapeHtml(r.reportedDateStr)} at ${escapeHtml(r.reportedTimeStr)}
                  </div>
                </div>
                <div style="display:flex; gap:0.5rem; flex-shrink:0;">
                  <button type="button" class="btn btn-success btn-sm js-dash-upload-fix-btn" data-id="${escapeHtml(r.id)}">
                    ${APP_ICONS.wrench}
                    <span>Upload Repair Proof + Date/Time</span>
                  </button>
                  <button type="button" class="btn btn-outline btn-sm js-dash-view-btn" data-id="${escapeHtml(r.id)}">
                    View Issue
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        `}
      </div>
    `;
  }

  // Wire event handlers
  container.querySelectorAll(".js-dash-nav").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  container.querySelectorAll(".js-dash-new-report").forEach(btn => {
    btn.addEventListener("click", () => document.getElementById("dialog-create-report")?.showModal());
  });

  container.querySelectorAll(".js-dash-notify-btn").forEach(btn => {
    btn.addEventListener("click", () => openSuperAdminNotifyFixerModal(btn.dataset.id));
  });

  container.querySelectorAll(".js-dash-upload-fix-btn").forEach(btn => {
    btn.addEventListener("click", () => openFixerProofModal(btn.dataset.id));
  });

  container.querySelectorAll(".js-dash-approve-btn").forEach(btn => {
    btn.addEventListener("click", () => openStoreApproveModal(btn.dataset.id));
  });

  container.querySelectorAll(".js-dash-view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab("panel-reports");
      state.searchQuery = btn.dataset.id;
      const searchBox = document.getElementById("search-reports");
      if (searchBox) searchBox.value = btn.dataset.id;
      renderReportsSection();
    });
  });

  container.querySelectorAll(".js-dash-filter-store").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab("panel-reports");
      state.searchQuery = btn.dataset.store;
      const searchBox = document.getElementById("search-reports");
      if (searchBox) searchBox.value = btn.dataset.store;
      renderReportsSection();
    });
  });
}

function renderAllViews() {
  const authView = document.getElementById("auth-view");
  const appView = document.getElementById("app-view");

  if (!state.currentUser) {
    authView.classList.remove("hidden");
    appView.classList.add("hidden");
    renderLoginAccountSelector();
    return;
  }

  authView.classList.add("hidden");
  appView.classList.remove("hidden");

  const roleBadge = document.getElementById("header-role-badge");
  const userSub = document.getElementById("header-user-subtitle");
  const role = state.currentUser.role;

  roleBadge.textContent = role.toUpperCase();
  roleBadge.className = "badge " + (
    role === "superadmin" ? "badge-purple" :
      role === "store" ? "badge-primary" : "badge-warning"
  );
  userSub.textContent = `${state.currentUser.displayName} (${state.currentUser.username}/${state.currentUser.password})`;

  const headingReports = document.getElementById("heading-reports");
  const subReports = document.getElementById("reports-subtitle");
  const btnGoNewReport = document.getElementById("btn-go-new-report");

  if (role === "store") {
    headingReports.textContent = `${state.currentUser.displayName} — My Store Reports`;
    subReports.textContent = "Report broken things (Picture + Caption + Priority) and approve when the Maintenance Technician repairs them.";
    btnGoNewReport.classList.remove("hidden");
  } else if (role === "fixer") {
    headingReports.textContent = "Technician Workspace — Assigned Store Repairs";
    subReports.textContent = "See broken reports from Store Accounts and upload proof of your repairs with Time & Date.";
    btnGoNewReport.classList.add("hidden");
  } else {
    headingReports.textContent = "SuperAdmin — All Store Reports Status";
    subReports.textContent = "Monitor Store Reports -> Dispatch Maintenance Technician -> Track Repairs & Store Legitimacy Approvals.";
    btnGoNewReport.classList.add("hidden");
  }

  const tabs = getRoleTabs(role);
  if (!tabs.some(t => t.id === state.activeTab)) {
    state.activeTab = tabs[0].id;
  }

  const desktopList = document.getElementById("desktop-nav-list");
  const mobileNav = document.getElementById("mobile-bottom-nav");

  desktopList.innerHTML = tabs.map(t => `
    <li>
      <button type="button" class="nav-item-btn js-nav-tab ${t.id === state.activeTab ? 'active' : ''}" data-tab="${t.id}">
        <span class="nav-icon">${t.iconSvg}</span>
        <span class="nav-label">${escapeHtml(t.label)}</span>
      </button>
    </li>
  `).join("");

  mobileNav.innerHTML = tabs.map(t => `
    <button type="button" class="bottom-nav-btn js-nav-tab ${t.id === state.activeTab ? 'active' : ''}" data-tab="${t.id}">
      <span class="bottom-nav-icon">${t.iconSvg}</span>
      <span class="bottom-nav-label">${escapeHtml(t.shortLabel)}</span>
    </button>
  `).join("");

  desktopList.querySelectorAll(".js-nav-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  mobileNav.querySelectorAll(".js-nav-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  switchTab(state.activeTab);
  renderQuickSwitchBar();
  renderRoleActionBanner();
  renderDashboardUI();
  populateFixerSelects();
  populateStoreSelects();
  renderReportsSection();
  renderManageStoresSection();
  renderUsersTable();
  renderNotificationsUI();
  populateSettingsForms();
  renderSmsLogsTable();
  updateSidebarIntegrationStatus();
}

function updateSidebarIntegrationStatus() {
  const smsEl = document.getElementById("sidebar-sms-status");
  const tgEl = document.getElementById("sidebar-tg-status");
  if (smsEl) {
    smsEl.textContent = state.settings.smsApiKey
      ? `SMS: SabayKonekta (${state.settings.smsGatewayId || 'Active'})`
      : `SMS: SabayKonekta (${state.settings.smsGatewayId || 'Bridge'})`;
  }
  if (tgEl) {
    tgEl.textContent = state.settings.tgBotToken && state.settings.tgChatId
      ? `IMG: Telegram Connected`
      : `IMG: Telegram Ready`;
  }
}

function populateFixerSelects() {
  const fixers = state.users.filter(u => u.role === "fixer");
  const notifyFixerTarget = document.getElementById("notify-fixer-target");
  if (!notifyFixerTarget) return;

  notifyFixerTarget.innerHTML = fixers.length > 0
    ? fixers.map(f => `<option value="${escapeHtml(f.username)}" data-phone="${escapeHtml(f.phone || '')}">${escapeHtml(f.displayName)} (${escapeHtml(f.username)} • ${escapeHtml(f.phone || 'No phone')})</option>`).join("")
    : `<option value="">No Technician Accounts Registered</option>`;
}

function populateStoreSelects() {
  const newSelect = document.getElementById("new-user-store-select");
  const editSelect = document.getElementById("edit-user-store-select");

  const buildOptions = () => {
    if (state.stores.length === 0) {
      return `<option value="">No store branches registered - please add one in Manage Stores</option>`;
    }
    return state.stores.map(s => {
      const codeText = s.code ? ` (${escapeHtml(s.code)})` : "";
      return `<option value="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" data-phone="${escapeHtml(s.phone || '')}">${escapeHtml(s.name)}${codeText}</option>`;
    }).join("");
  };

  if (newSelect) {
    const currentVal = newSelect.value;
    newSelect.innerHTML = buildOptions();
    if (currentVal && state.stores.some(s => s.id === currentVal)) {
      newSelect.value = currentVal;
    }
  }

  if (editSelect) {
    const currentVal = editSelect.value;
    editSelect.innerHTML = buildOptions();
    if (currentVal && state.stores.some(s => s.id === currentVal)) {
      editSelect.value = currentVal;
    }
  }
}

/* ==========================================================================
   9. RENDER REPORTS BOARD & TIMELINE AUDIT CARDS
   ========================================================================== */
function getVisibleReportsForUser() {
  if (!state.currentUser) return [];
  const role = state.currentUser.role;
  const myUsername = state.currentUser.username.toLowerCase();

  if (role === "store") {
    return state.reports.filter(r => (r.storeUsername || "").toLowerCase() === myUsername);
  }
  return state.reports;
}

function renderReportsSection() {
  if (!state.currentUser) return;

  const roleBasedReports = getVisibleReportsForUser();

  const totalCount = roleBasedReports.length;
  const pendingCount = roleBasedReports.filter(r => r.status === "pending" || r.status === "rejected").length;
  const awaitingCount = roleBasedReports.filter(r => r.status === "awaiting_approval").length;
  const approvedCount = roleBasedReports.filter(r => r.status === "approved").length;

  document.getElementById("kpi-total").textContent = totalCount;
  document.getElementById("kpi-pending").textContent = pendingCount;
  document.getElementById("kpi-awaiting").textContent = awaitingCount;
  document.getElementById("kpi-approved").textContent = approvedCount;

  const filtered = roleBasedReports.filter(r => {
    if (state.statusFilter !== "all" && r.status !== state.statusFilter) return false;
    if (state.priorityFilter !== "all" && r.priority !== state.priorityFilter) return false;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const hay = `${r.id} ${r.storeName} ${r.caption} ${r.assignedFixerName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const countBadge = document.getElementById("reports-count-badge");
  if (countBadge) {
    countBadge.textContent = filtered.length === totalCount ? `${totalCount} Reports` : `${filtered.length} of ${totalCount} Reports`;
  }

  const table = document.getElementById("reports-table");
  const tbody = document.getElementById("reports-table-tbody");
  const emptyState = document.getElementById("reports-empty-state");

  if (filtered.length === 0) {
    if (table) table.parentElement.classList.add("hidden");
    if (emptyState) {
      emptyState.classList.remove("hidden");
      emptyState.innerHTML = `
        <h3 class="section-title">No Reports Found</h3>
        <p class="text-sm text-muted" style="margin-top:0.35rem;">
          ${state.currentUser.role === "store"
          ? "No reports found for your store branch yet."
          : "No store reports match the selected filter."}
        </p>
        ${state.currentUser.role === "store" ? `
          <div style="margin-top:1rem;">
            <button type="button" class="btn btn-primary btn-sm js-reports-empty-create">
              ${APP_ICONS.createReport}
              <span>Report Broken Thing</span>
            </button>
          </div>
        ` : ''}
      `;
      emptyState.querySelectorAll(".js-reports-empty-create").forEach(btn => {
        btn.addEventListener("click", () => document.getElementById("dialog-create-report")?.showModal());
      });
    }
    return;
  }

  if (table) table.parentElement.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  if (tbody) {
    tbody.innerHTML = filtered.map(r => {
      const storeInitials = (r.storeName || r.storeUsername || "ST").replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
      const role = state.currentUser.role;

      let quickBtn = "";
      if (role === "store" && r.status === "awaiting_approval") {
        quickBtn = `<button type="button" class="btn btn-success btn-icon js-row-approve-btn" data-id="${escapeHtml(r.id)}" title="Review & Approve Repair" aria-label="Approve Repair">${APP_ICONS.shieldCheck}</button>`;
      } else if (role === "fixer" && (r.status === "pending" || r.status === "rejected")) {
        quickBtn = `<button type="button" class="btn btn-success btn-icon js-row-fix-btn" data-id="${escapeHtml(r.id)}" title="Upload Fix Proof" aria-label="Upload Fix Proof">${APP_ICONS.wrench}</button>`;
      } else if (role === "superadmin") {
        quickBtn = `<button type="button" class="btn btn-primary btn-icon js-row-notify-btn" data-id="${escapeHtml(r.id)}" title="Dispatch Technician" aria-label="Dispatch Technician">${APP_ICONS.send}</button>`;
      }

      return `
        <tr class="clickable-row js-report-row" data-id="${escapeHtml(r.id)}">
          <td>
            <span class="mono text-xs text-bold" style="color:var(--primary-text); background-color:var(--primary-soft); padding:0.2rem 0.45rem; border-radius:var(--radius-sm); border:1px solid var(--primary-border);">${escapeHtml(r.id)}</span>
          </td>
          <td>${getPriorityBadgeHtml(r.priority)}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <div class="user-avatar user-avatar-sm avatar-store" style="font-size:0.7rem; width:26px; height:26px;">${escapeHtml(storeInitials)}</div>
              <div>
                <div style="font-weight:700; font-size:0.82rem;">${escapeHtml(r.storeName)}</div>
                <div class="mono text-xs text-muted">@${escapeHtml(r.storeUsername)}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-size:0.82rem; font-weight:600; max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(r.caption)}">
              "${escapeHtml(r.caption)}"
            </div>
          </td>
          <td>${getStatusBadgeHtml(r.status)}</td>
          <td class="mono text-xs">${escapeHtml(r.assignedFixerName || 'All Technicians')}</td>
          <td class="mono text-xs">${escapeHtml(r.reportedDateStr)} ${escapeHtml(r.reportedTimeStr)}</td>
          <td style="text-align:right;">
            <div class="table-actions-cell" onclick="event.stopPropagation();">
              ${quickBtn}
              <button type="button" class="btn btn-outline btn-icon js-open-report-details" data-id="${escapeHtml(r.id)}" title="View Full Report Details" aria-label="View Details">
                ${APP_ICONS.eye}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll(".js-report-row").forEach(row => {
      row.addEventListener("click", () => openReportDetailsModal(row.dataset.id));
    });

    tbody.querySelectorAll(".js-open-report-details").forEach(btn => {
      btn.addEventListener("click", () => openReportDetailsModal(btn.dataset.id));
    });

    tbody.querySelectorAll(".js-row-approve-btn").forEach(btn => {
      btn.addEventListener("click", () => openStoreApproveModal(btn.dataset.id));
    });

    tbody.querySelectorAll(".js-row-fix-btn").forEach(btn => {
      btn.addEventListener("click", () => openFixerProofModal(btn.dataset.id));
    });

    tbody.querySelectorAll(".js-row-notify-btn").forEach(btn => {
      btn.addEventListener("click", () => openSuperAdminNotifyFixerModal(btn.dataset.id));
    });
  }
}

function openReportDetailsModal(reportId) {
  const r = state.reports.find(item => item.id === reportId);
  if (!r) return;

  const role = state.currentUser ? state.currentUser.role : "";
  const hasFixImage = Boolean(r.fixImageUrl);

  const modal = document.getElementById("dialog-report-details");
  if (!modal) return;

  document.getElementById("report-modal-id").textContent = r.id;

  const prioBadge = document.getElementById("report-modal-prio-badge");
  if (prioBadge) {
    prioBadge.outerHTML = `<span id="report-modal-prio-badge">${getPriorityBadgeHtml(r.priority)}</span>`;
  }

  const statusBadge = document.getElementById("report-modal-status-badge");
  if (statusBadge) {
    statusBadge.outerHTML = `<span id="report-modal-status-badge">${getStatusBadgeHtml(r.status)}</span>`;
  }

  const subtitle = document.getElementById("report-modal-subtitle");
  if (subtitle) {
    subtitle.textContent = `${r.storeName} (@${r.storeUsername}) • Reported on ${r.reportedDateStr} at ${r.reportedTimeStr}`;
  }

  const body = document.getElementById("report-modal-body");
  if (body) {
    body.innerHTML = `
      <!-- Issue Caption Box -->
      <div class="modal-details-callout">
        <div style="font-weight:700; color:var(--text-secondary); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:0.25rem;">
          Broken Item Caption &amp; Description
        </div>
        <div style="font-size:0.95rem; font-weight:600; color:var(--text-primary); line-height:1.4;">
          "${escapeHtml(r.caption)}"
        </div>
        <div class="mono text-xs text-muted" style="margin-top:0.4rem;">
          Reported by: <strong>${escapeHtml(r.storeName)}</strong> &bull; Assigned Technician: <strong>${escapeHtml(r.assignedFixerName || 'All Technicians')}</strong>
        </div>
      </div>

      <!-- Photos Grid: Store Issue Photo vs Technician Repair Proof -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:0.875rem;">
        <!-- Store Photo -->
        <div class="photo-frame" style="border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
          <div class="photo-frame-label" style="display:flex; justify-content:space-between; align-items:center; padding:0.45rem 0.65rem; background-color:var(--bg-muted); border-bottom:1px solid var(--border-color); font-weight:700; font-size:0.75rem;">
            <span>1. Store Issue Photo</span>
            <span class="badge badge-telegram" style="font-size:0.62rem; padding:0.1rem 0.4rem;">Telegram</span>
          </div>
          <div style="height:190px; background-color:var(--bg-surface); display:flex; align-items:center; justify-content:center; overflow:hidden;">
            <img
              src="${escapeHtml(r.brokenImageUrl)}"
              alt="Broken item reported by ${escapeHtml(r.storeName)}"
              class="js-open-lightbox"
              data-title="Store Broken Picture — ${escapeHtml(r.storeName)}"
              data-meta="Reported: ${escapeHtml(r.reportedDateStr)} ${escapeHtml(r.reportedTimeStr)} | Caption: ${escapeHtml(r.caption)}"
              loading="lazy"
              style="width:100%; height:100%; object-fit:cover; cursor:pointer;"
            />
          </div>
          <div style="padding:0.4rem 0.65rem; font-size:0.75rem; color:var(--text-muted); background-color:var(--bg-muted); border-top:1px solid var(--border-color);">
            Tap photo to open full view
          </div>
        </div>

        <!-- Technician Repair Proof -->
        <div class="photo-frame" style="border:1px solid ${hasFixImage ? 'var(--success-border)' : 'var(--border-color)'}; border-radius:var(--radius-md); overflow:hidden;">
          <div class="photo-frame-label" style="display:flex; justify-content:space-between; align-items:center; padding:0.45rem 0.65rem; background-color:${hasFixImage ? 'var(--success-soft)' : 'var(--bg-muted)'}; color:${hasFixImage ? 'var(--success-text)' : 'var(--text-secondary)'}; border-bottom:1px solid var(--border-color); font-weight:700; font-size:0.75rem;">
            <span>2. Technician Repair Proof</span>
            <span class="mono text-xs">${hasFixImage ? `${escapeHtml(r.fixedDate)} ${escapeHtml(r.fixedTime)}` : 'Pending'}</span>
          </div>
          ${hasFixImage ? `
            <div style="height:190px; background-color:var(--bg-surface); display:flex; align-items:center; justify-content:center; overflow:hidden;">
              <img
                src="${escapeHtml(r.fixImageUrl)}"
                alt="Repair proof uploaded by ${escapeHtml(r.fixedByName)}"
                class="js-open-lightbox"
                data-title="Technician Repair Proof — ${escapeHtml(r.fixedByName)}"
                data-meta="Repaired Date & Time: ${escapeHtml(r.fixedDate)} at ${escapeHtml(r.fixedTime)} | Notes: ${escapeHtml(r.fixNotes || 'Repaired')}"
                loading="lazy"
                style="width:100%; height:100%; object-fit:cover; cursor:pointer;"
              />
            </div>
            <div style="padding:0.4rem 0.65rem; font-size:0.75rem; color:var(--text-muted); background-color:var(--bg-muted); border-top:1px solid var(--border-color);">
              Notes: "${escapeHtml(r.fixNotes || 'Repair complete')}"
            </div>
          ` : `
            <div style="height:190px; background-color:var(--bg-muted); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:1.5rem; text-align:center; color:var(--text-muted);">
              ${APP_ICONS.wrench}
              <div style="font-weight:700; font-size:0.85rem; margin-top:0.5rem; color:var(--text-secondary);">No Repair Photo Yet</div>
              <p class="text-xs" style="margin-top:0.25rem;">Assigned technician has not uploaded proof of repair yet.</p>
            </div>
          `}
        </div>
      </div>

      <!-- 3-Step Flow Audit Timeline -->
      <div class="flow-timeline" style="margin-top:0.25rem;">
        <!-- Step 1: Store Report -->
        <div class="timeline-item">
          <div class="timeline-dot done">${APP_ICONS.check}</div>
          <div>
            <div><strong>Step 1 (Reported):</strong> ${escapeHtml(r.storeName)} logged issue &rarr; Technician &amp; SuperAdmin notified via SMS.</div>
            <div class="text-xs text-muted mono">
              Assigned: ${escapeHtml(r.assignedFixerName || 'All Technicians')}
              ${r.lastFixerNotifiedAt ? ` &bull; Last Alert: ${escapeHtml(r.lastFixerNotifiedAt)}` : ''}
            </div>
          </div>
        </div>

        <!-- Step 2: Fixer Picture + Time & Date -->
        <div class="timeline-item">
          <div class="timeline-dot ${r.fixedDate ? 'done' : 'active'}">${r.fixedDate ? APP_ICONS.check : '2'}</div>
          <div>
            ${r.fixedDate ? `
              <div><strong>Step 2 (Repair Logged):</strong> Repaired by ${escapeHtml(r.fixedByName)} on <span class="mono">${escapeHtml(r.fixedDate)}</span> at <span class="mono">${escapeHtml(r.fixedTime)}</span></div>
              ${r.fixNotes ? `<div class="text-xs text-muted">Proof Notes: "${escapeHtml(r.fixNotes)}"</div>` : ''}
            ` : `
              <div class="text-muted"><strong>Step 2 (Technician Queue):</strong> Awaiting Technician to complete repair and upload photo proof with Date &amp; Time.</div>
            `}
          </div>
        </div>

        <!-- Step 3: Store Approval -->
        <div class="timeline-item">
          <div class="timeline-dot ${r.status === 'approved' ? 'done' : (r.status === 'awaiting_approval' ? 'active' : 'wait')}">${r.status === 'approved' ? APP_ICONS.check : '3'}</div>
          <div>
            ${r.status === "approved" ? `
              <div style="color:var(--success-text);"><strong>Step 3 (Approved &amp; Legit):</strong> Verified by @${escapeHtml(r.approvedByUsername)} on <span class="mono">${escapeHtml(r.approvedDate)}</span> at <span class="mono">${escapeHtml(r.approvedTime)}</span> &rarr; <strong>SuperAdmin Notified!</strong></div>
              ${r.approvalRemarks ? `<div class="text-xs text-muted">Approval Remarks: "${escapeHtml(r.approvalRemarks)}"</div>` : ''}
            ` : (r.status === "awaiting_approval" ? `
              <div style="color:var(--warning-text); font-weight:700;"><strong>Step 3 (Pending Store Legitimacy Verification):</strong> Technician has finished. Store must check if repair is legitimate and approve.</div>
            ` : (r.status === "rejected" ? `
              <div style="color:var(--danger-text); font-weight:700;"><strong>Step 3 (Rejected for Re-Work):</strong> ${escapeHtml(r.approvalRemarks || 'Store rejected repair; re-work required.')}</div>
            ` : `
              <div class="text-muted"><strong>Step 3 (Store Legitimacy Approval):</strong> Store confirms repair legitimacy after technician submits proof.</div>
            `))}
          </div>
        </div>
      </div>
    `;

    body.querySelectorAll(".js-open-lightbox").forEach(img => {
      img.addEventListener("click", () => {
        openLightbox(img.src, img.dataset.title, img.dataset.meta);
      });
    });
  }

  // Footer Buttons
  const footer = document.getElementById("report-modal-footer");
  if (footer) {
    let actionsHtml = `<button type="button" class="btn btn-outline js-close-dialog" data-dialog="dialog-report-details">Close</button>`;

    if (role === "store" && r.status === "awaiting_approval") {
      actionsHtml = `
        <button type="button" class="btn btn-success js-details-approve-btn">
          ${APP_ICONS.shieldCheck}
          <span>Approve Legit Repair</span>
        </button>
        <button type="button" class="btn btn-outline js-details-reject-btn" style="color:var(--danger); border-color:var(--danger-border);">
          Request Re-Work
        </button>
        <button type="button" class="btn btn-outline js-close-dialog" data-dialog="dialog-report-details">Close</button>
      `;
    } else if (role === "fixer" && (r.status === "pending" || r.status === "rejected" || r.status === "awaiting_approval")) {
      actionsHtml = `
        <button type="button" class="btn btn-success js-details-fix-btn">
          ${APP_ICONS.wrench}
          <span>${r.status === 'awaiting_approval' ? 'Update Repair Proof' : 'Upload Repair Proof + Date/Time'}</span>
        </button>
        <button type="button" class="btn btn-outline js-close-dialog" data-dialog="dialog-report-details">Close</button>
      `;
    } else if (role === "superadmin") {
      actionsHtml = `
        <button type="button" class="btn btn-primary js-details-notify-btn">
          ${APP_ICONS.send}
          <span>Notify Technician via SMS</span>
        </button>
        <button type="button" class="btn btn-outline js-close-dialog" data-dialog="dialog-report-details">Close</button>
      `;
    }

    footer.innerHTML = actionsHtml;

    footer.querySelector(".js-details-approve-btn")?.addEventListener("click", () => {
      modal.close();
      openStoreApproveModal(r.id);
    });

    footer.querySelector(".js-details-reject-btn")?.addEventListener("click", () => {
      modal.close();
      openStoreApproveModal(r.id);
    });

    footer.querySelector(".js-details-fix-btn")?.addEventListener("click", () => {
      modal.close();
      openFixerProofModal(r.id);
    });

    footer.querySelector(".js-details-notify-btn")?.addEventListener("click", () => {
      modal.close();
      openSuperAdminNotifyFixerModal(r.id);
    });

    footer.querySelectorAll(".js-close-dialog").forEach(btn => {
      btn.addEventListener("click", () => modal.close());
    });
  }

  modal.showModal();
}

function getPriorityBadgeHtml(priority) {
  switch ((priority || "medium").toLowerCase()) {
    case "urgent":
      return `<span class="badge badge-danger"><span class="badge-dot"></span>Urgent</span>`;
    case "high":
      return `<span class="badge badge-warning"><span class="badge-dot"></span>High Priority</span>`;
    case "low":
      return `<span class="badge badge-neutral"><span class="badge-dot"></span>Low Priority</span>`;
    default:
      return `<span class="badge badge-primary"><span class="badge-dot"></span>Medium Priority</span>`;
  }
}

function getStatusBadgeHtml(status) {
  switch (status) {
    case "pending":
      return `<span class="badge badge-danger"><span class="badge-dot"></span>Step 1: Needs Repair</span>`;
    case "awaiting_approval":
      return `<span class="badge badge-warning"><span class="badge-dot"></span>Step 2: Awaiting Store Approval</span>`;
    case "approved":
      return `<span class="badge badge-success"><span class="badge-dot"></span>Step 3: Resolved &amp; Legit</span>`;
    case "rejected":
      return `<span class="badge badge-danger"><span class="badge-dot"></span>Rejected &bull; Re-Work</span>`;
    default:
      return `<span class="badge badge-neutral">${escapeHtml(status)}</span>`;
  }
}

/* ==========================================================================
   10. STEP 1: STORE ACCOUNT REPORTS -> FIXER (SMS + APP) & SUPERADMIN NOTIFIED
   ========================================================================== */
function setupCreateReportHandlers() {
  const photoInput = document.getElementById("report-photo-input");
  const photoPreview = document.getElementById("report-photo-preview");
  const form = document.getElementById("create-report-form");

  if (photoInput) {
    photoInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const { dataUrl, blob } = await compressImageFile(file);
        state.pendingReportPhotoDataUrl = dataUrl;
        state.pendingReportPhotoBlob = blob;
        photoPreview.src = dataUrl;
        document.getElementById("report-photo-preview-wrap")?.classList.remove("hidden");
      } catch (err) {
        showToast("Could not process image file.", "error");
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.currentUser) return;

      const caption = document.getElementById("report-caption").value.trim();
      const priorityRadio = form.querySelector('input[name="priority"]:checked');
      const priority = priorityRadio ? priorityRadio.value : "high";

      if (!state.pendingReportPhotoDataUrl) {
        showToast("Please take or upload a picture of the broken thing.", "warning");
        return;
      }

      if (!caption) {
        showToast("Please add a caption describing what is broken.", "warning");
        return;
      }

      const submitBtn = document.getElementById("btn-submit-report");
      submitBtn.disabled = true;
      submitBtn.textContent = "Uploading to Telegram & Notifying Technician + SuperAdmin...";

      try {
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const timeStr = now.toTimeString().slice(0, 5);
        const reportId = `REP-${Math.floor(1000 + Math.random() * 9000)}`;
        const storeName = state.currentUser.storeName || state.currentUser.displayName;

        const fixers = state.users.filter(u => u.role === "fixer");
        const primaryFixer = fixers[0] || { username: "fixer1", displayName: "Juan Dela Cruz (Lead Maintenance Tech)", phone: "+639170000004" };

        // 1. Upload photo to Telegram
        const tgCaption = `[STORE REPORT ${reportId}]\nStore: ${storeName}\nPriority: ${priority.toUpperCase()}\nCaption: ${caption}\nReported: ${dateStr} ${timeStr}`;
        const tgResult = await uploadPhotoViaTelegram(
          state.pendingReportPhotoBlob,
          state.pendingReportPhotoDataUrl,
          tgCaption
        );

        // 2. Create Report Object
        const newReport = {
          id: reportId,
          storeId: state.currentUser.storeId || state.currentUser.id,
          storeUsername: state.currentUser.username,
          storeName,
          caption,
          priority,
          status: "pending",
          assignedFixerUsername: primaryFixer.username,
          assignedFixerName: primaryFixer.displayName,
          assignedFixerPhone: primaryFixer.phone,
          brokenImageUrl: tgResult.imageUrl,
          brokenTelegramFileId: tgResult.telegramFileId,
          reportedAt: now.toISOString(),
          reportedDateStr: dateStr,
          reportedTimeStr: timeStr,
          fixerNotifiedCount: 1,
          lastFixerNotifiedAt: `${dateStr} ${timeStr} (Auto SMS + App)`,
          fixImageUrl: "",
          fixTelegramFileId: "",
          fixNotes: "",
          fixedDate: "",
          fixedTime: "",
          fixedAt: "",
          fixedByUsername: "",
          fixedByName: "",
          approvedDate: "",
          approvedTime: "",
          approvedAt: "",
          approvedByUsername: "",
          approvalRemarks: ""
        };

        state.reports.unshift(newReport);
        saveLocalCollection(LS_KEYS.REPORTS, state.reports);
        if (db) {
          await setDoc(doc(db, COLLECTIONS.REPORTS, newReport.id), newReport);
        }

        // 3. Notify Technician Account & SuperAdmin via In-App Notification
        await createAppNotification({
          targetRoles: ["superadmin", "fixer"],
          targetUsernames: fixers.map(f => f.username),
          title: `[${priority.toUpperCase()}] Store Report ${reportId} from ${storeName}`,
          message: `Store reported: "${caption}" (${dateStr} ${timeStr}). Technician notified via SMS & App.`,
          reportId: newReport.id,
          priority
        });

        // 4. Notify Technician Account via SabayKonekta SMS
        for (const f of fixers) {
          if (f.phone) {
            await dispatchSabayKonektaSms(
              f.phone,
              `[SuccessoReport ${reportId}] ${priority.toUpperCase()} PRIORITY from ${storeName}: "${caption}". Please inspect and upload picture of repair with time & date.`,
              `Store Report ${reportId} -> Technician (${f.username})`
            );
          }
        }

        // 5. Notify SuperAdmin via SabayKonekta SMS
        const superAdmins = state.users.filter(u => u.role === "superadmin" && u.phone);
        for (const sa of superAdmins) {
          await dispatchSabayKonektaSms(
            sa.phone,
            `[SuperAdmin Alert ${reportId}] ${storeName} reported (${priority.toUpperCase()}): "${caption}". Maintenance Technician notified.`,
            `Store Report ${reportId} -> SuperAdmin`
          );
        }

        form.reset();
        state.pendingReportPhotoDataUrl = "";
        state.pendingReportPhotoBlob = null;
        photoPreview.src = "";
        document.getElementById("report-photo-preview-wrap")?.classList.add("hidden");
        document.getElementById("dialog-create-report")?.close();

        showToast(`Report ${reportId} sent! Maintenance Technician & SuperAdmin notified via SMS and App Notification.`, "success");
        switchTab("panel-reports");
        renderReportsSection();
        renderRoleActionBanner();
      } catch (err) {
        showToast(`Failed to submit report: ${err.message}`, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Report -> Notify Technician (SMS + App) & SuperAdmin";
      }
    });
  }
}

/* ==========================================================================
   11. STEP 2: FIXER UPLOADS PICTURE OF FIX + TIME & DATE -> STORE FOR APPROVAL
   ========================================================================== */
function openFixerProofModal(reportId) {
  const report = state.reports.find(r => r.id === reportId);
  if (!report) return;

  const dialog = document.getElementById("dialog-fixer-submit");
  document.getElementById("fix-report-id").value = report.id;
  document.getElementById("fixer-modal-subtitle").textContent = `${report.id} • ${report.storeName} • "${report.caption.slice(0, 60)}"`;

  const now = new Date();
  document.getElementById("fix-date-input").value = report.fixedDate || now.toISOString().slice(0, 10);
  document.getElementById("fix-time-input").value = report.fixedTime || now.toTimeString().slice(0, 5);
  document.getElementById("fix-notes-input").value = report.fixNotes || "";

  state.pendingFixPhotoDataUrl = report.fixImageUrl || "";
  state.pendingFixPhotoBlob = null;
  const preview = document.getElementById("fix-photo-preview");
  const previewWrap = document.getElementById("fix-photo-preview-wrap");
  if (state.pendingFixPhotoDataUrl) {
    preview.src = state.pendingFixPhotoDataUrl;
    previewWrap?.classList.remove("hidden");
  } else {
    preview.src = "";
    previewWrap?.classList.add("hidden");
  }

  dialog.showModal();
}

function setupFixerProofHandlers() {
  const photoInput = document.getElementById("fix-photo-input");
  const photoPreview = document.getElementById("fix-photo-preview");
  const form = document.getElementById("fixer-proof-form");

  if (photoInput) {
    photoInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const { dataUrl, blob } = await compressImageFile(file);
        state.pendingFixPhotoDataUrl = dataUrl;
        state.pendingFixPhotoBlob = blob;
        photoPreview.src = dataUrl;
        document.getElementById("fix-photo-preview-wrap")?.classList.remove("hidden");
      } catch (err) {
        showToast("Could not read repair photo.", "error");
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const reportId = document.getElementById("fix-report-id").value;
      const fixedDate = document.getElementById("fix-date-input").value;
      const fixedTime = document.getElementById("fix-time-input").value;
      const fixNotes = document.getElementById("fix-notes-input").value.trim() || "Repaired and tested.";

      const report = state.reports.find(r => r.id === reportId);
      if (!report) return;

      if (!state.pendingFixPhotoDataUrl) {
        showToast("Please upload a picture of the repair.", "warning");
        return;
      }
      if (!fixedDate || !fixedTime) {
        showToast("Please enter the Date Repaired and Time Repaired.", "warning");
        return;
      }

      const submitBtn = document.getElementById("btn-submit-fix-proof");
      submitBtn.disabled = true;
      submitBtn.textContent = "Uploading Repair Photo to Telegram...";

      try {
        const tgCaption = `[TECHNICIAN REPAIRED ${report.id}]\nStore: ${report.storeName}\nRepaired By: ${state.currentUser.displayName}\nDate & Time Repaired: ${fixedDate} ${fixedTime}\nNotes: ${fixNotes}`;
        const tgResult = state.pendingFixPhotoBlob
          ? await uploadPhotoViaTelegram(state.pendingFixPhotoBlob, state.pendingFixPhotoDataUrl, tgCaption)
          : { imageUrl: state.pendingFixPhotoDataUrl, telegramFileId: report.fixTelegramFileId || `tg_fix_${Date.now()}` };

        report.status = "awaiting_approval";
        report.fixImageUrl = tgResult.imageUrl;
        report.fixTelegramFileId = tgResult.telegramFileId;
        report.fixNotes = fixNotes;
        report.fixedDate = fixedDate;
        report.fixedTime = fixedTime;
        report.fixedAt = new Date().toISOString();
        report.fixedByUsername = state.currentUser.username;
        report.fixedByName = state.currentUser.displayName;

        saveLocalCollection(LS_KEYS.REPORTS, state.reports);
        if (db) {
          await setDoc(doc(db, COLLECTIONS.REPORTS, report.id), report, { merge: true });
        }

        // Notify Store Account (for legitimacy approval) & SuperAdmin
        await createAppNotification({
          targetRoles: ["superadmin"],
          targetUsernames: [report.storeUsername],
          title: `Technician Repaired ${report.id} (${fixedDate} ${fixedTime}) — Store Approval Needed`,
          message: `${state.currentUser.displayName} uploaded picture of the repair on ${fixedDate} at ${fixedTime}. ${report.storeName} please approve if legit!`,
          reportId: report.id,
          priority: report.priority
        });

        const storeUser = state.users.find(u => u.username.toLowerCase() === (report.storeUsername || "").toLowerCase());
        if (storeUser && storeUser.phone) {
          await dispatchSabayKonektaSms(
            storeUser.phone,
            `[SuccessoReport ${report.id}] Technician ${state.currentUser.displayName} repaired your report on ${fixedDate} at ${fixedTime}. Please log in to approve if legit.`,
            `Repair Uploaded ${report.id} -> Store (${report.storeUsername})`
          );
        }

        form.reset();
        state.pendingFixPhotoDataUrl = "";
        state.pendingFixPhotoBlob = null;
        photoPreview.src = "";
        document.getElementById("fix-photo-preview-wrap")?.classList.add("hidden");
        document.getElementById("dialog-fixer-submit").close();
        renderReportsSection();
        renderRoleActionBanner();
        showToast(`Repair proof uploaded for ${report.id}! Sent to ${report.storeName} (${report.storeUsername}) for approval.`, "success");
      } catch (err) {
        showToast(`Error submitting repair proof: ${err.message}`, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Repair Proof -> Send to Store Account for Approval";
      }
    });
  }
}

/* ==========================================================================
   12. STEP 3: STORE APPROVES FIX (IF LEGIT) WITH TIME & DATE -> SUPERADMIN NOTIFIED
   ========================================================================== */
function openStoreApproveModal(reportId) {
  const report = state.reports.find(r => r.id === reportId);
  if (!report) return;

  const dialog = document.getElementById("dialog-store-approve");
  document.getElementById("approve-report-id").value = report.id;
  document.getElementById("approve-modal-subtitle").textContent = `${report.id} • Repaired by ${report.fixedByName} on ${report.fixedDate} at ${report.fixedTime}`;

  const compBox = document.getElementById("approve-comparison-box");
  compBox.innerHTML = `
    <div class="photo-frame">
      <div class="photo-frame-label"><span>BEFORE (STORE REPORT)</span></div>
      <img src="${escapeHtml(report.brokenImageUrl)}" alt="Broken item" />
    </div>
    <div class="photo-frame" style="border-color:var(--success);">
      <div class="photo-frame-label" style="background-color:var(--success-soft); color:var(--success-text);">
        <span>AFTER (TECHNICIAN PROOF)</span>
      </div>
      <img src="${escapeHtml(report.fixImageUrl)}" alt="Repair proof" />
    </div>
  `;

  const now = new Date();
  document.getElementById("approve-date-input").value = now.toISOString().slice(0, 10);
  document.getElementById("approve-time-input").value = now.toTimeString().slice(0, 5);
  document.getElementById("approve-remarks-input").value = "";
  document.getElementById("decision-approve").checked = true;

  dialog.showModal();
}

function setupStoreApproveHandlers() {
  const form = document.getElementById("store-approve-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const reportId = document.getElementById("approve-report-id").value;
    const approvedDate = document.getElementById("approve-date-input").value;
    const approvedTime = document.getElementById("approve-time-input").value;
    const remarks = document.getElementById("approve-remarks-input").value.trim();
    const decisionRadio = form.querySelector('input[name="decision"]:checked');
    const decision = decisionRadio ? decisionRadio.value : "approved";

    const report = state.reports.find(r => r.id === reportId);
    if (!report) return;

    const submitBtn = document.getElementById("btn-submit-store-approval");
    submitBtn.disabled = true;

    try {
      report.status = decision;
      report.approvedDate = approvedDate;
      report.approvedTime = approvedTime;
      report.approvedAt = new Date().toISOString();
      report.approvedByUsername = state.currentUser.username;
      report.approvalRemarks = remarks || (decision === "approved" ? "Verified legit repair by Store Account." : "Not legit / needs re-work.");

      saveLocalCollection(LS_KEYS.REPORTS, state.reports);
      if (db) {
        await setDoc(doc(db, COLLECTIONS.REPORTS, report.id), report, { merge: true });
      }

      const isLegit = decision === "approved";
      const notifTitle = isLegit
        ? `STORE APPROVED (${report.id}): Repair Verified Legit on ${approvedDate} ${approvedTime}`
        : `STORE REJECTED (${report.id}): Needs Re-Work (${approvedDate} ${approvedTime})`;
      const notifMsg = isLegit
        ? `${report.storeName} (@${state.currentUser.username}) approved the repair by ${report.fixedByName} on ${approvedDate} at ${approvedTime}. SuperAdmin notified!`
        : `${report.storeName} (@${state.currentUser.username}) rejected the repair on ${approvedDate} at ${approvedTime}. Reason: "${report.approvalRemarks}"`;

      // 1. Notify SuperAdmin (and Technician) via In-App Notification
      await createAppNotification({
        targetRoles: ["superadmin"],
        targetUsernames: [report.assignedFixerUsername, report.fixedByUsername].filter(Boolean),
        title: notifTitle,
        message: notifMsg,
        reportId: report.id,
        priority: report.priority
      });

      // 2. Notify SuperAdmin via SabayKonekta SMS
      const superAdmins = state.users.filter(u => u.role === "superadmin" && u.phone);
      for (const sa of superAdmins) {
        await dispatchSabayKonektaSms(
          sa.phone,
          `[SuperAdmin Notice ${report.id}] ${notifTitle} by ${report.storeName}. Technician: ${report.fixedByName}.`,
          `Store Approval ${report.id} -> SuperAdmin`
        );
      }

      document.getElementById("dialog-store-approve").close();
      renderReportsSection();
      renderRoleActionBanner();
      showToast(
        isLegit
          ? `Approved ${report.id} with Date (${approvedDate}) & Time (${approvedTime})! SuperAdmin has been notified.`
          : `Report ${report.id} marked for re-work. Technician & SuperAdmin notified.`,
        isLegit ? "success" : "warning"
      );
    } catch (err) {
      showToast(`Approval error: ${err.message}`, "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ==========================================================================
   13. SUPERADMIN: NOTIFY THE MAINTENANCE TECHNICIAN (SMS + IN-APP)
   ========================================================================== */
function openSuperAdminNotifyFixerModal(reportId) {
  const report = state.reports.find(r => r.id === reportId);
  if (!report) return;

  populateFixerSelects();

  const dialog = document.getElementById("dialog-notify-fixer");
  const select = document.getElementById("notify-fixer-target");
  const phoneInput = document.getElementById("notify-fixer-phone");
  const msgInput = document.getElementById("notify-fixer-message");

  document.getElementById("notify-report-id").value = report.id;
  document.getElementById("notify-fixer-subtitle").textContent = `${report.id} • ${report.storeName} (${report.priority.toUpperCase()})`;

  if (report.assignedFixerUsername) {
    select.value = report.assignedFixerUsername;
  }

  const selectedFixer = state.users.find(u => u.username === select.value);
  phoneInput.value = selectedFixer?.phone || report.assignedFixerPhone || "+639170000004";

  msgInput.value = `[SuperAdmin Follow-Up ${report.id}] Store: ${report.storeName} (${report.priority.toUpperCase()} Priority) — "${report.caption}". Please inspect and upload repair proof with date & time.`;

  select.onchange = () => {
    const f = state.users.find(u => u.username === select.value);
    if (f && f.phone) phoneInput.value = f.phone;
  };

  dialog.showModal();
}

function setupSuperAdminNotifyFixerHandlers() {
  const form = document.getElementById("notify-fixer-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const reportId = document.getElementById("notify-report-id").value;
    const fixerUsername = document.getElementById("notify-fixer-target").value;
    const fixerPhone = document.getElementById("notify-fixer-phone").value.trim();
    const message = document.getElementById("notify-fixer-message").value.trim();

    if (!fixerPhone || !message) {
      showToast("Please provide the Technician's phone number and message.", "warning");
      return;
    }

    const btn = document.getElementById("btn-send-fixer-notif");
    btn.disabled = true;
    btn.textContent = "Sending SMS & App Notification...";

    try {
      const now = new Date();
      const stamp = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
      const fixerUser = state.users.find(u => u.username === fixerUsername);
      const report = state.reports.find(r => r.id === reportId);

      if (report) {
        if (fixerUser) {
          report.assignedFixerUsername = fixerUser.username;
          report.assignedFixerName = fixerUser.displayName;
          report.assignedFixerPhone = fixerPhone;
        }
        report.fixerNotifiedCount = (report.fixerNotifiedCount || 1) + 1;
        report.lastFixerNotifiedAt = `${stamp} by SuperAdmin`;
        saveLocalCollection(LS_KEYS.REPORTS, state.reports);
        if (db) {
          setDoc(doc(db, COLLECTIONS.REPORTS, report.id), report, { merge: true }).catch(() => { });
        }
      }

      await createAppNotification({
        targetRoles: ["fixer"],
        targetUsernames: [fixerUsername],
        title: `SuperAdmin Notified You (${reportId})`,
        message,
        reportId,
        priority: report?.priority || "high"
      });

      const smsRes = await dispatchSabayKonektaSms(
        fixerPhone,
        message,
        `SuperAdmin Notify Technician (${reportId} -> @${fixerUsername})`
      );

      document.getElementById("dialog-notify-fixer").close();
      renderReportsSection();
      showToast(`Technician @${fixerUsername} notified via SabayKonekta SMS & App Notification!`, "success");
    } catch (err) {
      showToast(`Notify error: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send SMS & App Dispatch to Technician";
    }
  });
}

/* ==========================================================================
   14. SUPERADMIN: MANAGE USERS (Auto Same Username = Password)
   ========================================================================== */
function setupManageUsersHandlers() {
  const form = document.getElementById("create-user-form");
  const usernameInput = document.getElementById("new-user-username");
  const passwordInput = document.getElementById("new-user-password");
  const displayLabel = document.getElementById("label-new-user-display");
  const displayInput = document.getElementById("new-user-display");

  // Open Create User Modal
  document.getElementById("btn-open-create-user")?.addEventListener("click", () => {
    populateStoreSelects();
    const storeGroup = document.getElementById("create-user-store-dropdown-group");
    const roleRadio = form?.querySelector('input[name="role"]:checked');
    const isStore = !roleRadio || roleRadio.value === "store";
    if (storeGroup) {
      if (isStore) storeGroup.classList.remove("hidden");
      else storeGroup.classList.add("hidden");
    }
    if (isStore && displayInput) {
      const storeSel = document.getElementById("new-user-store-select");
      const opt = storeSel?.options[storeSel.selectedIndex];
      if (opt && opt.value) {
        if (!displayInput.value) displayInput.value = opt.dataset.name || "";
        const phoneInput = document.getElementById("new-user-phone");
        if (phoneInput && !phoneInput.value && opt.dataset.phone) phoneInput.value = opt.dataset.phone;
      }
    }
    document.getElementById("dialog-create-user")?.showModal();
  });

  // Filter pills: All, Store Accounts, Fixers, SuperAdmin
  document.querySelectorAll(".js-user-role-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".js-user-role-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.userRoleFilter = btn.dataset.role || "all";
      renderUsersTable();
    });
  });

  // Search input: real-time filter across display name, username, phone, and role
  const searchInput = document.getElementById("search-users-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.userSearchQuery = e.target.value.trim().toLowerCase();
      renderUsersTable();
    });
  }

  // Edit User modal form submission
  const editForm = document.getElementById("edit-user-form");
  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userId = document.getElementById("edit-user-id").value;
      const user = state.users.find(u => u.id === userId);
      if (!user) return;

      const newDisplay = document.getElementById("edit-user-display").value.trim();
      const newPhone = normalizePhone(document.getElementById("edit-user-phone").value.trim());
      const newPassword = document.getElementById("edit-user-password").value.trim();

      if (!newDisplay || !newPhone || !newPassword) {
        showToast("Please fill in all required fields.", "warning");
        return;
      }

      user.displayName = newDisplay;
      user.phone = newPhone;
      user.password = newPassword;

      if (user.role === "store") {
        const storeSel = document.getElementById("edit-user-store-select");
        if (storeSel && storeSel.value) {
          user.storeId = storeSel.value;
          const chosenStore = state.stores.find(s => s.id === storeSel.value);
          if (chosenStore) user.storeName = chosenStore.name;
        }
      }

      if (state.currentUser && state.currentUser.id === user.id) {
        state.currentUser = { ...user };
        saveLocalCollection(LS_KEYS.SESSION, state.currentUser);
      }

      saveLocalCollection(LS_KEYS.USERS, state.users);
      if (db) {
        await setDoc(doc(db, COLLECTIONS.USERS, user.id), user, { merge: true }).catch(() => { });
      }

      document.getElementById("dialog-edit-user")?.close();
      renderAllViews();
      renderManageStoresSection();
      showToast(`Account @${user.username} updated successfully!`, "success");
    });
  }

  if (!form) return;

  form.querySelectorAll('input[name="role"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const storeGroup = document.getElementById("create-user-store-dropdown-group");
      if (radio.value === "store") {
        if (storeGroup) storeGroup.classList.remove("hidden");
        populateStoreSelects();
        displayLabel.innerHTML = `Account Display Name <span class="req">*</span>`;
        usernameInput.placeholder = "e.g. store3";
        const storeSel = document.getElementById("new-user-store-select");
        const opt = storeSel?.options[storeSel.selectedIndex];
        if (opt && opt.value) {
          displayInput.value = opt.dataset.name || "";
          const phoneInput = document.getElementById("new-user-phone");
          if (phoneInput && opt.dataset.phone) phoneInput.value = opt.dataset.phone;
        }
      } else if (radio.value === "fixer") {
        if (storeGroup) storeGroup.classList.add("hidden");
        displayLabel.innerHTML = `Technician Full Name &amp; Specialty <span class="req">*</span>`;
        displayInput.placeholder = "e.g. Mario Reyes (Plumbing & Carpentry)";
        displayInput.value = "";
        usernameInput.placeholder = "e.g. tech1";
      } else {
        if (storeGroup) storeGroup.classList.add("hidden");
        displayLabel.innerHTML = `SuperAdmin Name <span class="req">*</span>`;
        displayInput.placeholder = "e.g. Regional SuperAdmin";
        displayInput.value = "";
        usernameInput.placeholder = "e.g. admin2";
      }
    });
  });

  const storeSelect = document.getElementById("new-user-store-select");
  if (storeSelect) {
    storeSelect.addEventListener("change", () => {
      const opt = storeSelect.options[storeSelect.selectedIndex];
      if (opt && opt.value) {
        displayInput.value = opt.dataset.name || "";
        const phoneInput = document.getElementById("new-user-phone");
        if (phoneInput && opt.dataset.phone) phoneInput.value = opt.dataset.phone;
      }
    });
  }

  usernameInput.addEventListener("input", () => {
    const clean = usernameInput.value.trim().toLowerCase().replace(/\s+/g, "_");
    usernameInput.value = clean;
    passwordInput.value = clean;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const roleRadio = form.querySelector('input[name="role"]:checked');
    const role = roleRadio ? roleRadio.value : "store";
    const displayName = displayInput.value.trim();
    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value.trim() || username;
    const phone = normalizePhone(document.getElementById("new-user-phone").value.trim());

    if (!displayName || !username || !phone) {
      showToast("Please fill in Name, Username, and Mobile Phone Number.", "warning");
      return;
    }

    if (state.users.some(u => u.username.toLowerCase() === username)) {
      showToast(`Username "${username}" already exists.`, "error");
      return;
    }

    let storeId = "";
    let storeName = "";
    if (role === "store") {
      const storeSel = document.getElementById("new-user-store-select");
      if (!storeSel || !storeSel.value) {
        showToast("Please select a Store Branch from Store Management (or add a branch first).", "warning");
        return;
      }
      storeId = storeSel.value;
      const chosenStore = state.stores.find(s => s.id === storeId);
      storeName = chosenStore ? chosenStore.name : displayName;
    }

    const newUser = {
      id: `user_${username}_${Date.now()}`,
      username,
      password,
      role,
      storeId,
      storeName,
      displayName: displayName || storeName,
      phone,
      createdAt: new Date().toISOString()
    };

    state.users.push(newUser);
    saveLocalCollection(LS_KEYS.USERS, state.users);
    if (db) {
      await setDoc(doc(db, COLLECTIONS.USERS, newUser.id), newUser).catch(() => { });
    }

    form.reset();
    document.getElementById("dialog-create-user")?.close();
    renderQuickSwitchBar();
    renderUsersTable();
    renderManageStoresSection();
    populateFixerSelects();
    const roleLabel = role === "fixer" ? "TECHNICIAN" : role.toUpperCase();
    showToast(`Created ${roleLabel} account! Credentials: ${username} / ${password}`, "success");
  });
}

function openEditUserModal(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;
  document.getElementById("edit-user-id").value = user.id;
  document.getElementById("edit-user-display").value = user.displayName;
  document.getElementById("edit-user-phone").value = user.phone || "";
  document.getElementById("edit-user-password").value = user.password;
  document.getElementById("edit-user-modal-subtitle").textContent = `@${user.username} (${user.role.toUpperCase()})`;

  const storeGroup = document.getElementById("edit-user-store-group");
  const storeSelect = document.getElementById("edit-user-store-select");
  if (user.role === "store") {
    if (storeGroup) storeGroup.style.display = "block";
    populateStoreSelects();
    if (storeSelect && user.storeId) {
      storeSelect.value = user.storeId;
    }
  } else {
    if (storeGroup) storeGroup.style.display = "none";
  }

  document.getElementById("dialog-edit-user")?.showModal();
}

function openUserDetailsModal(userId) {
  const user = state.users.find(u => u.id === userId);
  if (!user) return;

  const modal = document.getElementById("dialog-user-details");
  if (!modal) return;

  document.getElementById("user-modal-name").textContent = user.displayName;
  document.getElementById("user-modal-username").textContent = `@${user.username}`;

  const roleBadge = document.getElementById("user-modal-role-badge");
  if (roleBadge) {
    roleBadge.textContent = user.role.toUpperCase();
    roleBadge.className = "badge " + (
      user.role === "superadmin" ? "badge-purple" :
        user.role === "store" ? "badge-primary" : "badge-warning"
    );
  }

  const isDefaultSuperAdmin = user.username.toLowerCase() === "superadmin";

  const body = document.getElementById("user-modal-body");
  if (body) {
    body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        <!-- Username & Password Pill -->
        <div class="credential-pill">
          <span class="cred-label">Login Credentials</span>
          <div class="cred-val-wrap">
            <span class="mono">@${escapeHtml(user.username)} / </span>
            <span class="mono js-pw-display" data-real="${escapeHtml(user.password)}" data-masked="••••••••">••••••••</span>
          </div>
          <div style="display:flex; gap:0.25rem;">
            <button type="button" class="btn-cred-action js-toggle-pw">Show</button>
            <button type="button" class="btn-cred-action js-copy-val" data-copy="${escapeHtml(user.password)}">Copy</button>
          </div>
        </div>

        <!-- Phone Pill -->
        <div class="credential-pill">
          <span class="cred-label">SMS Alerts Phone</span>
          <div class="cred-val-wrap">
            <span class="mono">${escapeHtml(user.phone || 'Not set')}</span>
          </div>
          ${user.phone ? `
            <button type="button" class="btn-cred-action js-copy-val" data-copy="${escapeHtml(user.phone)}">Copy</button>
          ` : ''}
        </div>
      </div>
    `;

    body.querySelectorAll(".js-copy-val").forEach(btn => {
      btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy, `Copied to clipboard!`));
    });

    body.querySelectorAll(".js-toggle-pw").forEach(btn => {
      btn.addEventListener("click", () => {
        const pill = btn.closest(".credential-pill");
        const span = pill.querySelector(".js-pw-display");
        if (span.textContent === span.dataset.masked) {
          span.textContent = span.dataset.real;
          btn.textContent = "Hide";
        } else {
          span.textContent = span.dataset.masked;
          btn.textContent = "Show";
        }
      });
    });
  }

  const footer = document.getElementById("user-modal-footer");
  if (footer) {
    footer.innerHTML = `
      <button type="button" class="btn btn-primary js-user-modal-login" data-user="${escapeHtml(user.username)}" data-pass="${escapeHtml(user.password)}">
        Login as @${escapeHtml(user.username)}
      </button>
      <button type="button" class="btn btn-outline js-user-modal-edit" data-id="${escapeHtml(user.id)}">
        Edit
      </button>
      <button type="button" class="btn btn-outline js-user-modal-reset" data-id="${escapeHtml(user.id)}">
        Reset PW
      </button>
      ${!isDefaultSuperAdmin ? `
        <button type="button" class="btn btn-danger js-user-modal-delete" data-id="${escapeHtml(user.id)}">
          Delete
        </button>
      ` : ''}
      <button type="button" class="btn btn-outline js-close-dialog" data-dialog="dialog-user-details">Close</button>
    `;

    footer.querySelector(".js-user-modal-login")?.addEventListener("click", () => {
      modal.close();
      handleLogin(user.username, user.password);
    });

    footer.querySelector(".js-user-modal-edit")?.addEventListener("click", () => {
      modal.close();
      openEditUserModal(user.id);
    });

    footer.querySelector(".js-user-modal-reset")?.addEventListener("click", async () => {
      user.password = user.username;
      saveLocalCollection(LS_KEYS.USERS, state.users);
      if (db) {
        await setDoc(doc(db, COLLECTIONS.USERS, user.id), user, { merge: true }).catch(() => { });
      }
      renderUsersTable();
      renderManageStoresSection();
      renderQuickSwitchBar();
      modal.close();
      showToast(`Reset credentials for @${user.username} to ${user.username}/${user.username}`, "success");
    });

    footer.querySelector(".js-user-modal-delete")?.addEventListener("click", async () => {
      if (!confirm(`Are you sure you want to delete user account @${user.username}?`)) return;
      state.users = state.users.filter(u => u.id !== user.id);
      saveLocalCollection(LS_KEYS.USERS, state.users);
      if (db) {
        await deleteDoc(doc(db, COLLECTIONS.USERS, user.id)).catch(() => { });
      }
      renderUsersTable();
      renderManageStoresSection();
      renderQuickSwitchBar();
      populateFixerSelects();
      modal.close();
      showToast(`Deleted account @${user.username}.`, "info");
    });

    footer.querySelectorAll(".js-close-dialog").forEach(btn => {
      btn.addEventListener("click", () => modal.close());
    });
  }

  modal.showModal();
}

function renderUsersTable() {
  const tbody = document.getElementById("users-table-tbody");
  const table = document.getElementById("users-table");
  const emptyState = document.getElementById("users-empty-state");
  const badge = document.getElementById("users-count-badge");
  if (!tbody) return;

  // Calculate stats for KPI cards
  const totalUsers = state.users.length;
  const storeUsers = state.users.filter(u => u.role === "store").length;
  const fixerUsers = state.users.filter(u => u.role === "fixer").length;
  const adminUsers = state.users.filter(u => u.role === "superadmin").length;

  const kpiTotal = document.getElementById("kpi-users-total");
  const kpiStores = document.getElementById("kpi-users-stores");
  const kpiFixers = document.getElementById("kpi-users-fixers");
  const kpiAdmins = document.getElementById("kpi-users-admins");

  if (kpiTotal) kpiTotal.textContent = totalUsers;
  if (kpiStores) kpiStores.textContent = storeUsers;
  if (kpiFixers) kpiFixers.textContent = fixerUsers;
  if (kpiAdmins) kpiAdmins.textContent = adminUsers;

  // Update pill counts
  const pillAll = document.getElementById("pill-cnt-all");
  const pillStore = document.getElementById("pill-cnt-store");
  const pillFixer = document.getElementById("pill-cnt-fixer");
  const pillAdmin = document.getElementById("pill-cnt-admin");

  if (pillAll) pillAll.textContent = totalUsers;
  if (pillStore) pillStore.textContent = storeUsers;
  if (pillFixer) pillFixer.textContent = fixerUsers;
  if (pillAdmin) pillAdmin.textContent = adminUsers;

  // Filter users by role and search query
  const roleFilter = state.userRoleFilter || "all";
  const searchQuery = (state.userSearchQuery || "").toLowerCase();

  const filtered = state.users.filter(u => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (searchQuery) {
      const matchName = (u.displayName || "").toLowerCase().includes(searchQuery);
      const matchUsername = (u.username || "").toLowerCase().includes(searchQuery);
      const matchPhone = (u.phone || "").toLowerCase().includes(searchQuery);
      const matchRole = (u.role || "").toLowerCase().includes(searchQuery);
      if (!matchName && !matchUsername && !matchPhone && !matchRole) return false;
    }
    return true;
  });

  if (badge) {
    if (filtered.length === totalUsers) {
      badge.textContent = `${totalUsers} Users`;
    } else {
      badge.textContent = `${filtered.length} of ${totalUsers} Users`;
    }
  }

  if (filtered.length === 0) {
    if (table) table.parentElement.classList.add("hidden");
    if (emptyState) {
      emptyState.classList.remove("hidden");
      emptyState.innerHTML = `
        <p style="font-weight:700; color:var(--text-primary); margin-bottom:0.25rem;">No user accounts found matching "${escapeHtml(searchQuery)}".</p>
        <p class="text-xs text-muted">Try adjusting your role filter or search keyword.</p>
        <div style="margin-top:0.875rem;">
          <button type="button" class="btn btn-outline btn-sm js-open-create-user-modal">Create Account</button>
        </div>
      `;
      emptyState.querySelectorAll(".js-open-create-user-modal").forEach(btn => {
        btn.addEventListener("click", () => document.getElementById("dialog-create-user")?.showModal());
      });
    }
    return;
  }

  if (table) table.parentElement.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  tbody.innerHTML = filtered.map(u => {
    const isCurrent = state.currentUser && state.currentUser.username.toLowerCase() === u.username.toLowerCase();
    const isDefaultSuperAdmin = u.username.toLowerCase() === "superadmin";

    let roleBadge = "";
    let avatarClass = "avatar-store";
    let initials = u.username.slice(0, 2).toUpperCase();

    if (u.role === "superadmin") {
      roleBadge = `<span class="badge badge-purple">SUPERADMIN</span>`;
      avatarClass = "avatar-superadmin";
      initials = "SA";
    } else if (u.role === "store") {
      roleBadge = `<span class="badge badge-primary">STORE</span>`;
      avatarClass = "avatar-store";
      const words = (u.displayName || u.username).trim().split(/\s+/);
      initials = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : u.username.slice(0, 2).toUpperCase();
    } else {
      roleBadge = `<span class="badge badge-warning">TECHNICIAN</span>`;
      avatarClass = "avatar-tech";
      const words = (u.displayName || u.username).trim().split(/\s+/);
      initials = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : u.username.slice(0, 2).toUpperCase();
    }

    return `
      <tr class="clickable-row js-user-row" data-id="${escapeHtml(u.id)}">
        <td>${roleBadge}</td>
        <td>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <div class="user-avatar user-avatar-sm ${avatarClass}" style="font-size:0.75rem; width:28px; height:28px;">${escapeHtml(initials)}</div>
            <div>
              <div style="font-weight:700; font-size:0.875rem;">
                ${escapeHtml(u.displayName)}
                ${isCurrent ? '<span class="badge badge-success" style="font-size:0.6rem; padding:0.1rem 0.35rem; margin-left:0.25rem;">YOU</span>' : ''}
              </div>
              <div class="mono text-xs text-muted">
                @${escapeHtml(u.username)}
                ${u.role === 'store' && u.storeName ? `<span style="color:var(--text-secondary); margin-left:0.35rem;">&bull; Branch: <strong>${escapeHtml(u.storeName)}</strong></span>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td class="mono text-xs">
          <div style="display:flex; align-items:center; gap:0.35rem;">
            <span>@${escapeHtml(u.username)}</span>
            <span class="text-muted">/</span>
            <span class="js-pw-display" data-real="${escapeHtml(u.password)}" data-masked="••••••••">••••••••</span>
            <button type="button" class="btn-cred-action js-toggle-pw" onclick="event.stopPropagation();">Show</button>
            <button type="button" class="btn-cred-action js-copy-val" data-copy="${escapeHtml(u.password)}" onclick="event.stopPropagation();">Copy</button>
          </div>
        </td>
        <td class="mono text-xs">
          <div style="display:flex; align-items:center; gap:0.35rem;">
            <span>${escapeHtml(u.phone || 'Not set')}</span>
            ${u.phone ? `<button type="button" class="btn-cred-action js-copy-val" data-copy="${escapeHtml(u.phone)}" onclick="event.stopPropagation();">Copy</button>` : ''}
          </div>
        </td>
        <td style="text-align:right;">
          <div class="table-actions-cell" onclick="event.stopPropagation();">
            <button type="button" class="btn btn-primary btn-icon js-switch-to-user" data-user="${escapeHtml(u.username)}" data-pass="${escapeHtml(u.password)}" title="Login as ${escapeHtml(u.displayName)}" aria-label="Login as ${escapeHtml(u.displayName)}">
              ${APP_ICONS.login}
            </button>
            <button type="button" class="btn btn-outline btn-icon js-user-details-btn" data-id="${escapeHtml(u.id)}" title="View User Details" aria-label="View User Details">
              ${APP_ICONS.eye}
            </button>
            <button type="button" class="btn btn-outline btn-icon js-edit-user-btn" data-id="${escapeHtml(u.id)}" title="Edit User Account" aria-label="Edit User Account">
              ${APP_ICONS.edit}
            </button>
            <button type="button" class="btn btn-outline btn-icon js-reset-user-pw" data-id="${escapeHtml(u.id)}" title="Reset Password (${escapeHtml(u.username)}/${escapeHtml(u.username)})" aria-label="Reset Password">
              ${APP_ICONS.key}
            </button>
            ${!isDefaultSuperAdmin ? `
              <button type="button" class="btn btn-danger btn-icon js-delete-user" data-id="${escapeHtml(u.id)}" title="Delete User Account" aria-label="Delete User Account">
                ${APP_ICONS.trash}
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".js-user-row").forEach(row => {
    row.addEventListener("click", () => openUserDetailsModal(row.dataset.id));
  });

  tbody.querySelectorAll(".js-user-details-btn").forEach(btn => {
    btn.addEventListener("click", () => openUserDetailsModal(btn.dataset.id));
  });

  tbody.querySelectorAll(".js-copy-val").forEach(btn => {
    btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy, `Copied to clipboard!`));
  });

  tbody.querySelectorAll(".js-toggle-pw").forEach(btn => {
    btn.addEventListener("click", () => {
      const containerCell = btn.closest("td");
      const displaySpan = containerCell.querySelector(".js-pw-display");
      if (!displaySpan) return;
      if (displaySpan.textContent === displaySpan.dataset.masked) {
        displaySpan.textContent = displaySpan.dataset.real;
        btn.textContent = "Hide";
      } else {
        displaySpan.textContent = displaySpan.dataset.masked;
        btn.textContent = "Show";
      }
    });
  });

  tbody.querySelectorAll(".js-switch-to-user").forEach(btn => {
    btn.addEventListener("click", () => handleLogin(btn.dataset.user, btn.dataset.pass));
  });

  tbody.querySelectorAll(".js-edit-user-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditUserModal(btn.dataset.id));
  });

  tbody.querySelectorAll(".js-reset-user-pw").forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = state.users.find(u => u.id === btn.dataset.id);
      if (!user) return;
      user.password = user.username;
      saveLocalCollection(LS_KEYS.USERS, state.users);
      if (db) {
        await setDoc(doc(db, COLLECTIONS.USERS, user.id), user, { merge: true }).catch(() => { });
      }
      renderUsersTable();
      renderQuickSwitchBar();
      showToast(`Credentials for @${user.username} reset to ${user.username}/${user.username}`, "success");
    });
  });

  tbody.querySelectorAll(".js-delete-user").forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = state.users.find(u => u.id === btn.dataset.id);
      if (!user) return;
      if (!confirm(`Are you sure you want to delete user account @${user.username}?`)) return;
      state.users = state.users.filter(u => u.id !== user.id);
      saveLocalCollection(LS_KEYS.USERS, state.users);
      if (db) {
        await deleteDoc(doc(db, COLLECTIONS.USERS, user.id)).catch(() => { });
      }
      renderUsersTable();
      renderQuickSwitchBar();
      populateFixerSelects();
      showToast(`Deleted account @${user.username}.`, "info");
    });
  });
}

/* ==========================================================================/* ==========================================================================
   14B. SUPERADMIN: MANAGE STORES (Branch Directory, Address & Operational Status)
   ========================================================================== */
function setupManageStoresHandlers() {
  const form = document.getElementById("create-store-form");
  const editForm = document.getElementById("edit-store-form");

  // Open Create Store Modal
  document.getElementById("btn-open-create-store")?.addEventListener("click", () => {
    document.getElementById("dialog-create-store")?.showModal();
  });

  // Filter pills: All, Has Open Issues, Clean
  document.querySelectorAll(".js-store-status-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".js-store-status-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.storeStatusFilter = btn.dataset.status || "all";
      renderManageStoresSection();
    });
  });

  // Search input
  const searchInput = document.getElementById("search-stores-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.storeSearchQuery = e.target.value.trim();
      renderManageStoresSection();
    });
  }

  // Submit Create Store Branch form
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("new-store-name")?.value.trim() || "";
      const code = (document.getElementById("new-store-code")?.value.trim() || "").toUpperCase();
      const contactPerson = document.getElementById("new-store-contact")?.value.trim() || "";
      const address = document.getElementById("new-store-address")?.value.trim() || "";
      const phone = normalizePhone(document.getElementById("new-store-phone")?.value.trim() || "");

      if (!name || !address || !phone) {
        showToast("Please fill in Store Branch Name, Address, and SMS Mobile Phone.", "warning");
        return;
      }

      if (state.stores.some(s => s.name.toLowerCase() === name.toLowerCase())) {
        showToast(`Store branch "${name}" already exists.`, "error");
        return;
      }

      const newStore = {
        id: `store_${Date.now()}`,
        name,
        code: code || name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase(),
        contactPerson,
        address,
        phone,
        status: "active",
        createdAt: new Date().toISOString()
      };

      state.stores.push(newStore);
      saveLocalCollection(LS_KEYS.STORES, state.stores);
      if (db) {
        await setDoc(doc(db, COLLECTIONS.STORES, newStore.id), newStore).catch(() => { });
      }

      form.reset();
      document.getElementById("dialog-create-store")?.close();
      renderManageStoresSection();
      populateStoreSelects();
      showToast(`Created Store Branch "${name}"!`, "success");
    });
  }

  // Submit Edit Store Branch form
  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const storeId = document.getElementById("edit-store-id")?.value;
      const store = state.stores.find(s => s.id === storeId);
      if (!store) return;

      const name = document.getElementById("edit-store-name")?.value.trim() || "";
      const code = (document.getElementById("edit-store-code")?.value.trim() || "").toUpperCase();
      const contactPerson = document.getElementById("edit-store-contact")?.value.trim() || "";
      const address = document.getElementById("edit-store-address")?.value.trim() || "";
      const phone = normalizePhone(document.getElementById("edit-store-phone")?.value.trim() || "");
      const status = document.getElementById("edit-store-status")?.value || "active";

      if (!name || !address || !phone) {
        showToast("Please fill in Store Branch Name, Address, and SMS Phone.", "warning");
        return;
      }

      const oldName = store.name;
      store.name = name;
      store.code = code;
      store.contactPerson = contactPerson;
      store.address = address;
      store.phone = phone;
      store.status = status;

      // Update linked users' storeName if name changed
      let usersChanged = false;
      state.users.forEach(u => {
        if (u.role === "store" && (u.storeId === store.id || u.storeName === oldName)) {
          u.storeName = name;
          usersChanged = true;
        }
      });
      if (usersChanged) {
        saveLocalCollection(LS_KEYS.USERS, state.users);
      }

      // Update reports' storeName if name changed
      let reportsChanged = false;
      state.reports.forEach(r => {
        if (r.storeId === store.id || r.storeName === oldName) {
          r.storeName = name;
          reportsChanged = true;
        }
      });
      if (reportsChanged) {
        saveLocalCollection(LS_KEYS.REPORTS, state.reports);
      }

      saveLocalCollection(LS_KEYS.STORES, state.stores);
      if (db) {
        await setDoc(doc(db, COLLECTIONS.STORES, store.id), store, { merge: true }).catch(() => { });
      }

      document.getElementById("dialog-edit-store")?.close();
      renderManageStoresSection();
      renderUsersTable();
      populateStoreSelects();
      showToast(`Store branch "${name}" updated successfully!`, "success");
    });
  }
}

function openEditStoreModal(storeId) {
  const store = state.stores.find(s => s.id === storeId);
  if (!store) return;
  const modal = document.getElementById("dialog-edit-store");
  if (!modal) return;

  document.getElementById("edit-store-id").value = store.id;
  document.getElementById("edit-store-name").value = store.name;
  document.getElementById("edit-store-code").value = store.code || "";
  document.getElementById("edit-store-contact").value = store.contactPerson || "";
  document.getElementById("edit-store-address").value = store.address || "";
  document.getElementById("edit-store-phone").value = store.phone || "";
  const statusSel = document.getElementById("edit-store-status");
  if (statusSel) statusSel.value = store.status || "active";

  document.getElementById("edit-store-modal-subtitle").textContent = `${store.name} (${store.code || 'BRANCH'})`;
  modal.showModal();
}

function openStoreDetailsModal(storeId) {
  const store = state.stores.find(s => s.id === storeId || s.name.toLowerCase() === (storeId || "").toLowerCase());
  if (!store) return;

  const modal = document.getElementById("dialog-store-details");
  if (!modal) return;

  document.getElementById("store-modal-name").textContent = store.name;
  document.getElementById("store-modal-username").textContent = store.code ? `Branch Code: ${store.code}` : "Store Branch";

  const linkedUsers = state.users.filter(u => u.role === "store" && (u.storeId === store.id || u.storeName === store.name || u.displayName === store.name));
  const storeReports = state.reports.filter(r => (r.storeId === store.id || (r.storeName || "").toLowerCase() === store.name.toLowerCase() || linkedUsers.some(lu => lu.username.toLowerCase() === (r.storeUsername || "").toLowerCase())));
  const openIssues = storeReports.filter(r => r.status === "pending" || r.status === "rejected").length;
  const pendingFix = storeReports.filter(r => r.status === "awaiting_approval").length;
  const resolved = storeReports.filter(r => r.status === "approved").length;

  const body = document.getElementById("store-modal-body");
  if (body) {
    body.innerHTML = `
      <div class="modal-metrics-grid">
        <div class="modal-metric-card">
          <div class="text-xs text-muted">Open Issues</div>
          <div style="font-size:1.25rem; font-weight:800; color:${openIssues > 0 ? 'var(--danger)' : 'var(--text-primary)'};">${openIssues}</div>
        </div>
        <div class="modal-metric-card">
          <div class="text-xs text-muted">Waiting Approval</div>
          <div style="font-size:1.25rem; font-weight:800; color:${pendingFix > 0 ? 'var(--warning)' : 'var(--text-primary)'};">${pendingFix}</div>
        </div>
        <div class="modal-metric-card">
          <div class="text-xs text-muted">Legit Fixed</div>
          <div style="font-size:1.25rem; font-weight:800; color:var(--success);">${resolved}</div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        <div class="credential-pill">
          <span class="cred-label">Address / Location</span>
          <div class="cred-val-wrap">
            <span>${escapeHtml(store.address || 'No address set')}</span>
          </div>
        </div>
        <div class="credential-pill">
          <span class="cred-label">SMS Alerts Phone</span>
          <div class="cred-val-wrap">
            <span class="mono">${escapeHtml(store.phone || 'Not set')}</span>
          </div>
          ${store.phone ? `<button type="button" class="btn-cred-action js-copy-val" data-copy="${escapeHtml(store.phone)}">Copy</button>` : ''}
        </div>
        ${store.contactPerson ? `
          <div class="credential-pill">
            <span class="cred-label">Contact / Manager</span>
            <div class="cred-val-wrap">
              <span>${escapeHtml(store.contactPerson)}</span>
            </div>
          </div>
        ` : ''}
      </div>

      <div style="margin-top:0.35rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
          <div style="font-weight:700; font-size:0.875rem;">Assigned User Accounts (${linkedUsers.length})</div>
          <span class="text-xs text-muted">Manage in Users tab</span>
        </div>
        ${linkedUsers.length > 0 ? `
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            ${linkedUsers.map(lu => `
              <div style="display:flex; align-items:center; justify-content:space-between; padding:0.45rem 0.65rem; border:1px solid var(--border-color); border-radius:var(--radius-sm); background-color:var(--bg-card);">
                <div>
                  <span class="mono text-xs text-bold">@${escapeHtml(lu.username)}</span>
                  <span class="text-xs text-muted"> &bull; ${escapeHtml(lu.displayName)}</span>
                </div>
                <div style="display:flex; gap:0.35rem;">
                  <button type="button" class="btn btn-primary btn-sm js-modal-switch-user" data-user="${escapeHtml(lu.username)}" data-pass="${escapeHtml(lu.password)}">
                    Login
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <p class="text-xs text-muted">No user accounts assigned to this branch yet. Create one in <strong>Manage Users</strong> and select this store from the dropdown.</p>
        `}
      </div>
    `;

    body.querySelectorAll(".js-copy-val").forEach(btn => {
      btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy, `Copied to clipboard!`));
    });

    body.querySelectorAll(".js-modal-switch-user").forEach(btn => {
      btn.addEventListener("click", () => {
        modal.close();
        handleLogin(btn.dataset.user, btn.dataset.pass);
      });
    });
  }

  const footer = document.getElementById("store-modal-footer");
  if (footer) {
    footer.innerHTML = `
      <button type="button" class="btn btn-outline js-close-dialog" data-dialog="dialog-store-details">Close</button>
      <button type="button" class="btn btn-primary js-store-modal-edit" data-id="${escapeHtml(store.id)}">Edit Branch</button>
    `;
    footer.querySelector(".js-close-dialog")?.addEventListener("click", () => modal.close());
    footer.querySelector(".js-store-modal-edit")?.addEventListener("click", () => {
      modal.close();
      openEditStoreModal(store.id);
    });
  }

  modal.showModal();
}

function renderManageStoresSection() {
  const tbody = document.getElementById("stores-table-tbody");
  const table = document.getElementById("stores-table");
  const emptyState = document.getElementById("stores-empty-state");
  const badge = document.getElementById("stores-count-badge");
  if (!tbody) return;

  const stores = state.stores;
  const totalStores = stores.length;

  // Calculate report metrics per store
  const storeStats = stores.map(store => {
    const linkedUsers = state.users.filter(u => u.role === "store" && (u.storeId === store.id || u.storeName === store.name || u.displayName === store.name));
    const storeReports = state.reports.filter(r => (r.storeId === store.id || (r.storeName || "").toLowerCase() === store.name.toLowerCase() || linkedUsers.some(lu => lu.username.toLowerCase() === (r.storeUsername || "").toLowerCase())));
    const openIssues = storeReports.filter(r => r.status === "pending" || r.status === "rejected").length;
    const pendingApproval = storeReports.filter(r => r.status === "awaiting_approval").length;
    const resolved = storeReports.filter(r => r.status === "approved").length;
    return {
      store,
      linkedUsers,
      reportsCount: storeReports.length,
      openIssues,
      pendingApproval,
      resolved,
      hasIssues: (openIssues + pendingApproval) > 0
    };
  });

  const storesWithIssues = storeStats.filter(s => s.hasIssues).length;
  const operationalStores = totalStores - storesWithIssues;
  const totalStoreReports = state.reports.length;

  // Update KPI counters
  const kpiTotal = document.getElementById("kpi-stores-total");
  const kpiIssues = document.getElementById("kpi-stores-with-issues");
  const kpiOperational = document.getElementById("kpi-stores-operational");
  const kpiReports = document.getElementById("kpi-stores-reports-total");

  if (kpiTotal) kpiTotal.textContent = totalStores;
  if (kpiIssues) kpiIssues.textContent = storesWithIssues;
  if (kpiOperational) kpiOperational.textContent = operationalStores;
  if (kpiReports) kpiReports.textContent = totalStoreReports;

  // Update filter pill counters
  const pillAll = document.getElementById("stores-pill-all");
  const pillIssues = document.getElementById("stores-pill-issues");
  const pillClean = document.getElementById("stores-pill-clean");

  if (pillAll) pillAll.textContent = totalStores;
  if (pillIssues) pillIssues.textContent = storesWithIssues;
  if (pillClean) pillClean.textContent = operationalStores;

  // Filter
  const statusFilter = state.storeStatusFilter || "all";
  const searchQuery = (state.storeSearchQuery || "").toLowerCase();

  const filteredStats = storeStats.filter(item => {
    if (statusFilter === "has_issues" && !item.hasIssues) return false;
    if (statusFilter === "clean" && item.hasIssues) return false;

    if (searchQuery) {
      const matchName = (item.store.name || "").toLowerCase().includes(searchQuery);
      const matchCode = (item.store.code || "").toLowerCase().includes(searchQuery);
      const matchAddress = (item.store.address || "").toLowerCase().includes(searchQuery);
      const matchPhone = (item.store.phone || "").toLowerCase().includes(searchQuery);
      if (!matchName && !matchCode && !matchAddress && !matchPhone) return false;
    }
    return true;
  });

  if (badge) {
    badge.textContent = filteredStats.length === totalStores ? `${totalStores} Stores` : `${filteredStats.length} of ${totalStores} Stores`;
  }

  if (filteredStats.length === 0) {
    if (table) table.parentElement.classList.add("hidden");
    if (emptyState) {
      emptyState.classList.remove("hidden");
      emptyState.innerHTML = `
        <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" style="margin:0 auto 0.75rem auto; color:var(--text-muted); display:block;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <div style="font-weight:700; font-size:1rem; margin-bottom:0.25rem;">No store branches found</div>
        <p class="text-xs text-muted" style="margin-bottom:1rem;">No store branches match the current filter or search criteria.</p>
        <button type="button" class="btn btn-outline btn-sm js-open-create-store-modal">Add Store Branch</button>
      `;
      emptyState.querySelectorAll(".js-open-create-store-modal").forEach(btn => {
        btn.addEventListener("click", () => document.getElementById("dialog-create-store")?.showModal());
      });
    }
    return;
  }

  if (table) table.parentElement.classList.remove("hidden");
  if (emptyState) emptyState.classList.add("hidden");

  tbody.innerHTML = filteredStats.map(item => {
    const s = item.store;
    const initial = (s.name || "S").charAt(0).toUpperCase();

    let statusBadge = `<span class="badge badge-success">&#10003; 100% Operational</span>`;
    if (item.openIssues > 0) {
      statusBadge = `<span class="badge badge-danger">&#9888; ${item.openIssues} Open Issue${item.openIssues > 1 ? 's' : ''}</span>`;
    } else if (item.pendingApproval > 0) {
      statusBadge = `<span class="badge badge-warning">&#9203; ${item.pendingApproval} Waiting Approval</span>`;
    }

    return `
      <tr class="clickable-row js-store-row" data-id="${escapeHtml(s.id)}">
        <td>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <div class="user-avatar user-avatar-sm avatar-store" style="font-size:0.75rem; width:28px; height:28px;">${escapeHtml(initial)}</div>
            <div>
              <div style="font-weight:700; font-size:0.875rem;">
                ${escapeHtml(s.name)}
                ${s.code ? `<span class="badge badge-neutral mono" style="font-size:0.65rem; padding:0.1rem 0.35rem; margin-left:0.3rem;">${escapeHtml(s.code)}</span>` : ''}
              </div>
              ${s.contactPerson ? `<div class="text-xs text-muted">Lead: ${escapeHtml(s.contactPerson)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="font-size:0.8rem; max-width:240px;">
          <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(s.address || 'No address set')}">
            ${escapeHtml(s.address || 'No address set')}
          </div>
        </td>
        <td class="mono text-xs">
          <div style="display:flex; align-items:center; gap:0.35rem;">
            <span>${escapeHtml(s.phone || 'Not set')}</span>
            ${s.phone ? `<button type="button" class="btn-cred-action js-copy-val" data-copy="${escapeHtml(s.phone)}" onclick="event.stopPropagation();">Copy</button>` : ''}
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex; align-items:center; gap:0.25rem; flex-wrap:wrap;">
            ${item.linkedUsers.length > 0 ? item.linkedUsers.map(lu => `<span class="badge badge-primary mono" style="font-size:0.65rem; padding:0.15rem 0.4rem;" title="${escapeHtml(lu.displayName)}">@${escapeHtml(lu.username)}</span>`).join('') : '<span class="text-muted text-xs">No accounts</span>'}
          </div>
        </td>
        <td>
          <button type="button" class="badge badge-neutral js-store-filter-reports" data-store="${escapeHtml(s.name)}" style="cursor:pointer;" onclick="event.stopPropagation();">
            ${item.reportsCount} Reports &rarr;
          </button>
        </td>
        <td style="text-align:right;">
          <div class="table-actions-cell" onclick="event.stopPropagation();">
            <button type="button" class="btn btn-outline btn-icon js-store-details-btn" data-id="${escapeHtml(s.id)}" title="View Branch Details" aria-label="View Branch Details">
              ${APP_ICONS.eye}
            </button>
            <button type="button" class="btn btn-outline btn-icon js-edit-store-btn" data-id="${escapeHtml(s.id)}" title="Edit Store Branch" aria-label="Edit Store Branch">
              ${APP_ICONS.edit}
            </button>
            <button type="button" class="btn btn-danger btn-icon js-delete-store-btn" data-id="${escapeHtml(s.id)}" title="Delete Store Branch" aria-label="Delete Store Branch">
              ${APP_ICONS.trash}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  // Wire Row Click
  tbody.querySelectorAll(".js-store-row").forEach(row => {
    row.addEventListener("click", () => openStoreDetailsModal(row.dataset.id));
  });

  tbody.querySelectorAll(".js-store-details-btn").forEach(btn => {
    btn.addEventListener("click", () => openStoreDetailsModal(btn.dataset.id));
  });

  tbody.querySelectorAll(".js-edit-store-btn").forEach(btn => {
    btn.addEventListener("click", () => openEditStoreModal(btn.dataset.id));
  });

  // Wire Copy buttons
  tbody.querySelectorAll(".js-copy-val").forEach(btn => {
    btn.addEventListener("click", () => copyToClipboard(btn.dataset.copy, `Copied to clipboard!`));
  });

  // Wire filter reports
  tbody.querySelectorAll(".js-store-filter-reports").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab("panel-reports");
      state.searchQuery = btn.dataset.store;
      const box = document.getElementById("search-reports");
      if (box) box.value = btn.dataset.store;
      renderReportsSection();
    });
  });

  // Wire Delete store
  tbody.querySelectorAll(".js-delete-store-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const store = state.stores.find(s => s.id === btn.dataset.id);
      if (!store) return;
      const linked = state.users.filter(u => u.role === "store" && (u.storeId === store.id || u.storeName === store.name));
      const confirmMsg = linked.length > 0
        ? `Are you sure you want to delete Store Branch "${store.name}"? Note: ${linked.length} user account(s) are currently linked to this branch.`
        : `Are you sure you want to delete Store Branch "${store.name}"?`;
      if (!confirm(confirmMsg)) return;

      state.stores = state.stores.filter(s => s.id !== store.id);
      saveLocalCollection(LS_KEYS.STORES, state.stores);
      if (db) {
        await deleteDoc(doc(db, COLLECTIONS.STORES, store.id)).catch(() => { });
      }
      renderManageStoresSection();
      populateStoreSelects();
      showToast(`Deleted Store Branch "${store.name}".`, "info");
    });
  });
}

/* ==========================================================================
   15. SETTINGS: SABAYKONEKTA SMS & TELEGRAM BOT CONFIGURATION
   ========================================================================== */
function populateSettingsForms() {
  const smsEndpoint = document.getElementById("cfg-sms-endpoint");
  const smsApiKey = document.getElementById("cfg-sms-apikey");
  const smsGateway = document.getElementById("cfg-sms-gateway");
  const smsBridge = document.getElementById("cfg-sms-firestore-bridge");
  const tgToken = document.getElementById("cfg-tg-token");
  const tgChatId = document.getElementById("cfg-tg-chatid");

  if (smsEndpoint) smsEndpoint.value = state.settings.smsEndpoint || DEFAULT_SETTINGS.smsEndpoint;
  if (smsApiKey) smsApiKey.value = state.settings.smsApiKey || "";
  if (smsGateway) smsGateway.value = state.settings.smsGatewayId || "default_gateway";
  if (smsBridge) smsBridge.checked = state.settings.smsFirestoreBridge !== false;
  if (tgToken) tgToken.value = state.settings.tgBotToken || "";
  if (tgChatId) tgChatId.value = state.settings.tgChatId || "";
}

function setupSettingsHandlers() {
  const smsForm = document.getElementById("settings-sms-form");
  const tgForm = document.getElementById("settings-tg-form");
  const btnTestSms = document.getElementById("btn-test-sms");
  const btnTestTg = document.getElementById("btn-test-tg");

  if (smsForm) {
    smsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      state.settings.smsEndpoint = document.getElementById("cfg-sms-endpoint").value.trim() || DEFAULT_SETTINGS.smsEndpoint;
      state.settings.smsApiKey = document.getElementById("cfg-sms-apikey").value.trim();
      state.settings.smsGatewayId = document.getElementById("cfg-sms-gateway").value.trim() || "default_gateway";
      state.settings.smsFirestoreBridge = document.getElementById("cfg-sms-firestore-bridge").checked;

      saveLocalCollection(LS_KEYS.SETTINGS, state.settings);
      if (db) {
        await setDoc(doc(db, COLLECTIONS.SETTINGS, "global"), state.settings, { merge: true }).catch(() => { });
      }
      updateSidebarIntegrationStatus();
      showToast("SabayKonekta SMS settings saved!", "success");
    });
  }

  if (btnTestSms) {
    btnTestSms.addEventListener("click", async () => {
      const targetPhone = state.currentUser?.phone || "+639170000001";
      btnTestSms.disabled = true;
      btnTestSms.textContent = "Sending Test SMS...";
      try {
        const res = await dispatchSabayKonektaSms(
          targetPhone,
          `[SuccessoReport] Test SMS dispatch via SabayKonekta Gateway (${state.settings.smsGatewayId || 'default_gateway'}).`,
          "Manual Settings Test"
        );
        showToast(`Test SMS dispatched to ${targetPhone}: ${res.status}`, "success");
      } finally {
        btnTestSms.disabled = false;
        btnTestSms.textContent = "Send Test SMS";
      }
    });
  }

  if (tgForm) {
    tgForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      state.settings.tgBotToken = document.getElementById("cfg-tg-token").value.trim();
      state.settings.tgChatId = document.getElementById("cfg-tg-chatid").value.trim();

      saveLocalCollection(LS_KEYS.SETTINGS, state.settings);
      if (db) {
        await setDoc(doc(db, COLLECTIONS.SETTINGS, "global"), state.settings, { merge: true }).catch(() => { });
      }
      updateSidebarIntegrationStatus();
      showToast("Telegram Bot Image Handler settings saved!", "success");
    });
  }

  if (btnTestTg) {
    btnTestTg.addEventListener("click", async () => {
      const token = document.getElementById("cfg-tg-token").value.trim();
      if (!token) {
        showToast("Please enter a Telegram Bot Token first.", "warning");
        return;
      }
      btnTestTg.disabled = true;
      btnTestTg.textContent = "Testing Bot...";
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || "Invalid Bot Token");
        showToast(`Telegram Bot verified: @${data.result.username}!`, "success");
      } catch (err) {
        showToast(`Telegram test failed: ${err.message}`, "error");
      } finally {
        btnTestTg.disabled = false;
        btnTestTg.textContent = "Test Telegram Bot";
      }
    });
  }
}

function renderSmsLogsTable() {
  const tbody = document.getElementById("sms-logs-tbody");
  const countBadge = document.getElementById("sms-log-count");
  if (!tbody) return;

  if (countBadge) countBadge.textContent = `${state.smsLogs.length} Dispatches`;

  if (state.smsLogs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-muted" style="text-align:center; padding:1.5rem;">
          No SMS dispatches logged yet. Submit a Store Report, Dispatch Technician, or Approve a Repair to see live SabayKonekta SMS dispatches.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.smsLogs.slice(0, 30).map(log => {
    const timeStr = new Date(log.createdAt).toLocaleString([], {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
    return `
      <tr>
        <td data-label="Time" class="mono text-xs">${escapeHtml(timeStr)}</td>
        <td data-label="Recipient" class="mono text-xs"><strong>${escapeHtml(log.to)}</strong><br/><span class="text-muted">${escapeHtml(log.context || '')}</span></td>
        <td data-label="Message" class="text-xs">${escapeHtml(log.message)}</td>
        <td data-label="Gateway / Status"><span class="badge badge-primary">${escapeHtml(log.status)}</span></td>
      </tr>
    `;
  }).join("");
}

/* ==========================================================================
   15B. DEVICE CAMERA CONTROLLER (Live Stream Viewfinder + Shutter + Native Fallback)
   ========================================================================== */
let cameraStream = null;
let currentFacingMode = "environment"; // default to rear camera
let activeCameraTarget = "report"; // "report" or "fix"
let snappedBlob = null;
let snappedDataUrl = "";

async function openDeviceCamera(target) {
  activeCameraTarget = target;
  snappedBlob = null;
  snappedDataUrl = "";

  const dialog = document.getElementById("dialog-camera-capture");
  if (!dialog) return;

  const subtitle = document.getElementById("camera-modal-subtitle");
  if (subtitle) {
    subtitle.textContent = target === "report"
      ? "Take a photo of the broken item (Store Report)"
      : "Take a photo of the completed repair (Technician Proof)";
  }

  // Reset modal UI state
  const video = document.getElementById("camera-video-stream");
  const snapPreview = document.getElementById("camera-snapshot-preview");
  const liveControls = document.getElementById("camera-live-controls");
  const reviewControls = document.getElementById("camera-review-controls");
  const errorMsg = document.getElementById("camera-error-msg");

  if (video) video.classList.remove("hidden");
  if (snapPreview) snapPreview.classList.add("hidden");
  if (liveControls) liveControls.classList.remove("hidden");
  if (reviewControls) reviewControls.classList.add("hidden");
  if (errorMsg) errorMsg.classList.add("hidden");

  dialog.showModal();
  await startCameraStream();
}

async function startCameraStream() {
  stopCameraStream();

  const video = document.getElementById("camera-video-stream");
  const loadingOverlay = document.getElementById("camera-loading-overlay");
  const errorMsg = document.getElementById("camera-error-msg");
  const errorText = document.getElementById("camera-error-text");

  if (loadingOverlay) loadingOverlay.classList.remove("hidden");
  if (errorMsg) errorMsg.classList.add("hidden");

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Live camera stream is not supported in this browser context (requires HTTPS or secure origin).");
    }

    const constraints = {
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (video) {
      video.srcObject = cameraStream;
      await video.play();
    }
  } catch (err) {
    console.warn("Camera getUserMedia error:", err);
    if (errorMsg && errorText) {
      errorText.textContent = `${err.message || "Could not access device camera."} Tap below to use your phone's native camera shutter directly.`;
      errorMsg.classList.remove("hidden");
    }
  } finally {
    if (loadingOverlay) loadingOverlay.classList.add("hidden");
  }
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  const video = document.getElementById("camera-video-stream");
  if (video) {
    video.srcObject = null;
  }
}

function closeCameraModal() {
  stopCameraStream();
  document.getElementById("dialog-camera-capture")?.close();
}

function snapCameraPhoto() {
  const video = document.getElementById("camera-video-stream");
  const canvas = document.getElementById("camera-snapshot-canvas");
  const snapPreview = document.getElementById("camera-snapshot-preview");
  const liveControls = document.getElementById("camera-live-controls");
  const reviewControls = document.getElementById("camera-review-controls");

  if (!video || !canvas) return;

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);

  snappedDataUrl = canvas.toDataURL("image/jpeg", 0.85);

  canvas.toBlob(blob => {
    snappedBlob = blob;
  }, "image/jpeg", 0.85);

  if (snapPreview) {
    snapPreview.src = snappedDataUrl;
    snapPreview.classList.remove("hidden");
  }
  if (video) video.classList.add("hidden");
  if (liveControls) liveControls.classList.add("hidden");
  if (reviewControls) reviewControls.classList.remove("hidden");
}

function retakeCameraPhoto() {
  const video = document.getElementById("camera-video-stream");
  const snapPreview = document.getElementById("camera-snapshot-preview");
  const liveControls = document.getElementById("camera-live-controls");
  const reviewControls = document.getElementById("camera-review-controls");

  snappedBlob = null;
  snappedDataUrl = "";

  if (snapPreview) snapPreview.classList.add("hidden");
  if (video) video.classList.remove("hidden");
  if (liveControls) liveControls.classList.remove("hidden");
  if (reviewControls) reviewControls.classList.add("hidden");
}

function confirmCameraSnapshot() {
  if (!snappedDataUrl) return;

  if (activeCameraTarget === "report") {
    state.pendingReportPhotoDataUrl = snappedDataUrl;
    state.pendingReportPhotoBlob = snappedBlob;
    const preview = document.getElementById("report-photo-preview");
    if (preview) preview.src = snappedDataUrl;
    document.getElementById("report-photo-preview-wrap")?.classList.remove("hidden");
    showToast("Photo captured from device camera!", "success");
  } else {
    state.pendingFixPhotoDataUrl = snappedDataUrl;
    state.pendingFixPhotoBlob = snappedBlob;
    const preview = document.getElementById("fix-photo-preview");
    if (preview) preview.src = snappedDataUrl;
    document.getElementById("fix-photo-preview-wrap")?.classList.remove("hidden");
    showToast("Repair proof photo captured from device camera!", "success");
  }

  closeCameraModal();
}

function switchCameraFacingMode() {
  currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
  startCameraStream();
}

function setupDeviceCameraHandlers() {
  // Open live camera buttons
  document.querySelectorAll(".js-open-camera-btn").forEach(btn => {
    btn.addEventListener("click", () => openDeviceCamera(btn.dataset.target));
  });

  // Camera modal controls
  document.getElementById("btn-snap-photo")?.addEventListener("click", snapCameraPhoto);
  document.getElementById("btn-retake-snapshot")?.addEventListener("click", retakeCameraPhoto);
  document.getElementById("btn-use-snapshot")?.addEventListener("click", confirmCameraSnapshot);
  document.getElementById("btn-switch-camera")?.addEventListener("click", switchCameraFacingMode);

  document.querySelectorAll(".js-close-camera").forEach(btn => {
    btn.addEventListener("click", closeCameraModal);
  });

  document.getElementById("dialog-camera-capture")?.addEventListener("close", () => {
    stopCameraStream();
  });

  // Native camera fallback button
  document.getElementById("btn-fallback-native-camera")?.addEventListener("click", () => {
    closeCameraModal();
    if (activeCameraTarget === "report") {
      document.getElementById("report-photo-native-camera")?.click();
    } else {
      document.getElementById("fix-photo-native-camera")?.click();
    }
  });

  // Handle mobile native camera input
  const reportNative = document.getElementById("report-photo-native-camera");
  if (reportNative) {
    reportNative.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const { dataUrl, blob } = await compressImageFile(file);
        state.pendingReportPhotoDataUrl = dataUrl;
        state.pendingReportPhotoBlob = blob;
        const preview = document.getElementById("report-photo-preview");
        if (preview) preview.src = dataUrl;
        document.getElementById("report-photo-preview-wrap")?.classList.remove("hidden");
        showToast("Photo captured from mobile camera!", "success");
      } catch (err) {
        showToast("Could not process photo.", "error");
      }
    });
  }

  const fixNative = document.getElementById("fix-photo-native-camera");
  if (fixNative) {
    fixNative.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const { dataUrl, blob } = await compressImageFile(file);
        state.pendingFixPhotoDataUrl = dataUrl;
        state.pendingFixPhotoBlob = blob;
        const preview = document.getElementById("fix-photo-preview");
        if (preview) preview.src = dataUrl;
        document.getElementById("fix-photo-preview-wrap")?.classList.remove("hidden");
        showToast("Repair photo captured from mobile camera!", "success");
      } catch (err) {
        showToast("Could not process photo.", "error");
      }
    });
  }

  // Clear / Retake buttons in form preview
  document.querySelectorAll(".js-clear-photo-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      if (target === "report") {
        state.pendingReportPhotoDataUrl = "";
        state.pendingReportPhotoBlob = null;
        const fileInput = document.getElementById("report-photo-input");
        const nativeInput = document.getElementById("report-photo-native-camera");
        if (fileInput) fileInput.value = "";
        if (nativeInput) nativeInput.value = "";
        const preview = document.getElementById("report-photo-preview");
        if (preview) preview.src = "";
        document.getElementById("report-photo-preview-wrap")?.classList.add("hidden");
      } else {
        state.pendingFixPhotoDataUrl = "";
        state.pendingFixPhotoBlob = null;
        const fileInput = document.getElementById("fix-photo-input");
        const nativeInput = document.getElementById("fix-photo-native-camera");
        if (fileInput) fileInput.value = "";
        if (nativeInput) nativeInput.value = "";
        const preview = document.getElementById("fix-photo-preview");
        if (preview) preview.src = "";
        document.getElementById("fix-photo-preview-wrap")?.classList.add("hidden");
      }
    });
  });
}

/* ==========================================================================
   16. NOTIFICATIONS DRAWER, PASSWORD MODAL & LIGHTBOX
   ========================================================================== */
function renderNotificationsUI() {
  const unreadBadge = document.getElementById("notif-unread-badge");
  const listEl = document.getElementById("notifications-list");
  if (!state.currentUser) return;

  const myNotifs = getMyNotifications();
  const myUsername = state.currentUser.username.toLowerCase();
  const unreadCount = myNotifs.filter(n => !(n.readBy || []).includes(myUsername)).length;

  if (unreadBadge) {
    if (unreadCount > 0) {
      unreadBadge.textContent = unreadCount;
      unreadBadge.classList.remove("hidden");
    } else {
      unreadBadge.classList.add("hidden");
    }
  }

  if (!listEl) return;
  if (myNotifs.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center; padding:2rem 1rem;" class="text-muted text-sm">
        No notifications for @${escapeHtml(state.currentUser.username)} yet.
      </div>
    `;
    return;
  }

  listEl.innerHTML = myNotifs.map(n => {
    const isUnread = !(n.readBy || []).includes(myUsername);
    const timeStr = new Date(n.createdAt).toLocaleString([], {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
    return `
      <div style="padding:0.875rem; border:2px solid ${isUnread ? 'var(--primary)' : 'var(--border-color)'}; background-color:${isUnread ? 'var(--primary-soft)' : 'var(--bg-muted)'}; border-radius:var(--radius-md);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; margin-bottom:0.25rem;">
          <strong style="font-size:0.875rem;">${escapeHtml(n.title)}</strong>
          <span class="mono text-xs text-muted">${escapeHtml(timeStr)}</span>
        </div>
        <p class="text-xs" style="color:var(--text-secondary);">${escapeHtml(n.message)}</p>
      </div>
    `;
  }).join("");
}

function openLightbox(src, title, meta) {
  const dialog = document.getElementById("dialog-lightbox");
  document.getElementById("lightbox-img").src = src;
  document.getElementById("lightbox-title").textContent = title || "Telegram Image Viewer";
  document.getElementById("lightbox-meta").textContent = meta || "";
  dialog.showModal();
}

/* ==========================================================================
   17. GLOBAL UI EVENT LISTENERS & DIALOG LIGHT-DISMISS
   ========================================================================== */
function setupGlobalListeners() {
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const u = document.getElementById("login-username").value;
      const p = document.getElementById("login-password").value;
      handleLogin(u, p);
    });
  }

  const btnToggleLoginPw = document.getElementById("btn-toggle-login-pw");
  const loginPwInput = document.getElementById("login-password");
  if (btnToggleLoginPw && loginPwInput) {
    btnToggleLoginPw.addEventListener("click", () => {
      const isPw = loginPwInput.type === "password";
      loginPwInput.type = isPw ? "text" : "password";
      btnToggleLoginPw.textContent = isPw ? "Hide" : "Show";
      btnToggleLoginPw.setAttribute("aria-pressed", String(isPw));
    });
  }

  document.querySelectorAll(".js-quick-login").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("login-username").value = btn.dataset.user;
      document.getElementById("login-password").value = btn.dataset.pass;
      handleLogin(btn.dataset.user, btn.dataset.pass);
    });
  });

  document.getElementById("btn-logout")?.addEventListener("click", handleLogout);

  document.getElementById("btn-go-new-report")?.addEventListener("click", () => {
    switchTab("panel-create-report");
  });

  document.querySelectorAll(".js-status-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      setStatusFilter(btn.dataset.status);
    });
  });

  document.getElementById("filter-priority")?.addEventListener("change", (e) => {
    state.priorityFilter = e.target.value;
    renderReportsSection();
  });
  document.getElementById("search-reports")?.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim();
    renderReportsSection();
  });

  document.getElementById("btn-open-notifications")?.addEventListener("click", () => {
    renderNotificationsUI();
    document.getElementById("dialog-notifications").showModal();
  });

  document.getElementById("btn-mark-all-read")?.addEventListener("click", () => {
    if (!state.currentUser) return;
    const me = state.currentUser.username.toLowerCase();
    state.notifications.forEach(n => {
      if (!Array.isArray(n.readBy)) n.readBy = [];
      if (!n.readBy.includes(me)) n.readBy.push(me);
      if (db) setDoc(doc(db, COLLECTIONS.NOTIFS, n.id), n, { merge: true }).catch(() => { });
    });
    saveLocalCollection(LS_KEYS.NOTIFS, state.notifications);
    renderNotificationsUI();
  });

  document.getElementById("btn-open-pw-modal")?.addEventListener("click", () => {
    if (!state.currentUser) return;
    document.getElementById("pw-modal-subtitle").textContent = `Account: @${state.currentUser.username}`;
    document.getElementById("new-password-input").value = state.currentUser.password;
    document.getElementById("dialog-password").showModal();
  });

  document.getElementById("change-pw-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentUser) return;
    const newPw = document.getElementById("new-password-input").value.trim();
    if (!newPw) return;

    state.currentUser.password = newPw;
    saveLocalCollection(LS_KEYS.USERS, state.users);
    if (db) {
      await setDoc(doc(db, COLLECTIONS.USERS, state.currentUser.id), state.currentUser, { merge: true }).catch(() => { });
    }
    document.getElementById("dialog-password").close();
    renderAllViews();
    showToast("Password updated!", "success");
  });

  document.querySelectorAll(".js-close-dialog").forEach(btn => {
    btn.addEventListener("click", () => {
      const dlg = document.getElementById(btn.dataset.dialog);
      if (dlg) dlg.close();
    });
  });

  document.querySelectorAll("dialog.flat-dialog").forEach(dlg => {
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg.close();
    });
  });
}

/* ==========================================================================
   18. UTILITIES
   ========================================================================== */
function showToast(message, type = "info") {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;

  const item = document.createElement("div");
  const typeClass = type === "success" ? "toast-success" :
    type === "error" ? "toast-error" :
      type === "warning" ? "toast-warning" : "";
  item.className = `toast-item ${typeClass}`;
  item.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button type="button" class="btn btn-sm" style="min-height:26px; padding:0.15rem 0.45rem; background:rgba(0,0,0,0.25); color:#fff; border:none;">X</button>
  `;

  item.querySelector("button").addEventListener("click", () => item.remove());
  stack.appendChild(item);

  setTimeout(() => {
    if (item.parentNode) item.remove();
  }, 4500);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function copyToClipboard(text, successMsg = "Copied to clipboard!") {
  if (!text) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    showToast(successMsg, "info");
  } catch (err) {
    showToast(`Could not copy: ${text}`, "warning");
  }
}

/* ==========================================================================
   19. INITIALIZE APPLICATION
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  loadLocalState();
  setupGlobalListeners();
  setupDeviceCameraHandlers();
  setupCreateReportHandlers();
  setupFixerProofHandlers();
  setupStoreApproveHandlers();
  setupSuperAdminNotifyFixerHandlers();
  setupManageUsersHandlers();
  setupManageStoresHandlers();
  setupSettingsHandlers();
  renderAllViews();
  initFirebaseAndStreams();
});
