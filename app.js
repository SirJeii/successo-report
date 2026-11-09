/**
 * SuccessoReport — Internal Helpdesk & Issue Tracking System
 * --------------------------------------------------------------------------
 * Role-Based Access Control (RBAC):
 *   1. Requester (Employee): Submits tickets, tracks requests, views details, confirms/rejects resolutions.
 *   2. Head Admin: Triages tickets, sets priority (Low/Med/High/Urgent), assigns to Internal/External, SLA monitoring, reports.
 *   3. Personnel (Internal/External): "My Tasks" view (tasks due today + rework), views details & history, marks done with proof.
 *   4. Superadmin: Global system oversight, User & Branch CRUD, Telegram/SLA settings, reports.
 *
 * Core Integrations:
 *   - Database: Firebase Firestore with hybrid LocalStorage fallback
 *   - File Storage: Telegram Bot API for photos & camera captures with local data URL caching
 *   - 72-Hour SLA Engine: Color-coded dynamic time tracking (Green <24h, Yellow 24-48h, Red >48h/Breached)
 *   - Reporting Engine: Filterable/Groupable by Department, Personnel, Priority, Branch + CSV Export
 */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ==========================================================================
   1. CONSTANTS, SCHEMAS & DEFAULT DATA
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
  SESSION: "helpdesk_session_v3",
  USERS: "helpdesk_users_v3",
  STORES: "helpdesk_branches_v3",
  TICKETS: "helpdesk_tickets_v3",
  NOTIFS: "helpdesk_notifications_v3",
  SETTINGS: "helpdesk_settings_v3"
};

const COLLECTIONS = {
  USERS: "helpdesk_users_v3",
  STORES: "helpdesk_branches_v3",
  TICKETS: "helpdesk_tickets_v3",
  NOTIFS: "helpdesk_notifications_v3",
  SETTINGS: "helpdesk_settings_v3"
};

const CONCERN_TYPES = [
  "Repair & Maintenance",
  "Asset & Tools",
  "Marketing",
  "Compliance",
  "HRD",
  "Audit",
  "Accounting",
  "Warehouse & Logistics",
  "Supply & Inventory"
];

const PREPOPULATED_EMPLOYEES = [
  { name: "Maria Clara", email: "maria.clara@successo.ph", phone: "+639170000005", branchId: "branch_main", branchName: "Successo Store - Main Branch", department: "Marketing" },
  { name: "Jose Rizal", email: "jose.rizal@successo.ph", phone: "+639170000006", branchId: "branch_makati", branchName: "Successo Store - Makati Branch", department: "Supply & Inventory" },
  { name: "Andres Bonifacio", email: "andres.bonifacio@successo.ph", phone: "+639171110003", branchId: "branch_hub", branchName: "Successo Central Logistics Hub", department: "Warehouse & Logistics" },
  { name: "Gabriela Silang", email: "gabriela.silang@successo.ph", phone: "+639171110004", branchId: "branch_main", branchName: "Successo Store - Main Branch", department: "HRD" },
  { name: "Emilio Aguinaldo", email: "emilio.aguinaldo@successo.ph", phone: "+639171110005", branchId: "branch_makati", branchName: "Successo Store - Makati Branch", department: "Accounting" }
];

const DEFAULT_STORES = [
  {
    id: "branch_main",
    code: "BGC",
    name: "Successo Store - Main Branch",
    address: "Level 1, Bonifacio High Street, BGC, Taguig City",
    phone: "+639170000002",
    status: "active",
    createdAt: "2026-11-01T08:00:00.000Z"
  },
  {
    id: "branch_makati",
    code: "MKT",
    name: "Successo Store - Makati Branch",
    address: "Ground Floor, Glorietta 4, Ayala Center, Makati City",
    phone: "+639170000003",
    status: "active",
    createdAt: "2026-11-01T08:05:00.000Z"
  },
  {
    id: "branch_hub",
    code: "HUB",
    name: "Successo Central Logistics Hub",
    address: "Warehouse 4B, FTI Complex, Taguig City",
    phone: "+639170000009",
    status: "active",
    createdAt: "2026-11-01T08:10:00.000Z"
  }
];

const DEFAULT_USERS = [
  {
    id: "user_superadmin",
    username: "superadmin",
    password: "superadmin",
    role: "superadmin",
    displayName: "System SuperAdmin",
    email: "superadmin@successo.ph",
    department: "Executive & System Admin",
    branchId: "branch_main",
    branchName: "Successo Store - Main Branch",
    phone: "+639170000001",
    createdAt: "2026-11-01T08:00:00.000Z"
  },
  {
    id: "user_headadmin",
    username: "headadmin",
    password: "headadmin",
    role: "headadmin",
    displayName: "Operations Head Admin",
    email: "headadmin@successo.ph",
    department: "Admin Triage & Operations",
    branchId: "branch_main",
    branchName: "Successo Store - Main Branch",
    phone: "+639170000002",
    createdAt: "2026-11-01T08:05:00.000Z"
  },
  {
    id: "user_personnel1",
    username: "personnel1",
    password: "personnel1",
    role: "personnel",
    displayName: "Juan Dela Cruz (Maintenance & Facilities)",
    email: "juan.delacruz@successo.ph",
    department: "Repair & Maintenance",
    branchId: "branch_main",
    branchName: "Successo Store - Main Branch",
    phone: "+639170000003",
    isExternal: false,
    createdAt: "2026-11-01T08:10:00.000Z"
  },
  {
    id: "user_personnel2",
    username: "personnel2",
    password: "personnel2",
    role: "personnel",
    displayName: "Pedro Santos (IT & Asset Specialist)",
    email: "pedro.santos@successo.ph",
    department: "Asset & Tools",
    branchId: "branch_makati",
    branchName: "Successo Store - Makati Branch",
    phone: "+639170000004",
    isExternal: false,
    createdAt: "2026-11-01T08:12:00.000Z"
  },
  {
    id: "user_requester1",
    username: "requester1",
    password: "requester1",
    role: "requester",
    displayName: "Maria Clara",
    email: "maria.clara@successo.ph",
    department: "Marketing",
    branchId: "branch_main",
    branchName: "Successo Store - Main Branch",
    phone: "+639170000005",
    createdAt: "2026-11-01T08:15:00.000Z"
  },
  {
    id: "user_requester2",
    username: "requester2",
    password: "requester2",
    role: "requester",
    displayName: "Jose Rizal",
    email: "jose.rizal@successo.ph",
    department: "Supply & Inventory",
    branchId: "branch_makati",
    branchName: "Successo Store - Makati Branch",
    phone: "+639170000006",
    createdAt: "2026-11-01T08:20:00.000Z"
  }
];

const DEFAULT_SETTINGS = {
  tgBotToken: "",
  tgChatId: "",
  slaHoursMax: 72,
  smsEndpoint: "https://sabaykonekta.netlify.app/api/v1/send-sms",
  smsApiKey: ""
};

function createFlatSvgPlaceholder(bgColor, titleText, subText) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
    <rect width="640" height="480" fill="${bgColor}"/>
    <rect x="28" y="28" width="584" height="424" fill="none" stroke="#ffffff" stroke-width="4"/>
    <text x="320" y="220" font-family="Inter, sans-serif" font-size="24" font-weight="800" fill="#ffffff" text-anchor="middle">${titleText}</text>
    <text x="320" y="260" font-family="monospace" font-size="15" font-weight="600" fill="#f1f5f9" text-anchor="middle">${subText}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Generate realistic timestamps relative to now for dynamic SLA testing
const nowMs = Date.now();
const formatIso = (offsetHours) => new Date(nowMs - offsetHours * 3600 * 1000).toISOString();
const todayDateStr = new Date().toISOString().slice(0, 10);

const DEFAULT_TICKETS = [
  // 1. New Submission: Awaiting Head Admin Triage (Reported 4h ago -> Green SLA)
  {
    id: "TICK-1001",
    concernType: "Repair & Maintenance",
    title: "Chiller compressor overheating & seal tear",
    description: "Display chiller in main beverage section is rattling loudly and leaking cold air through torn gasket.",
    attachments: [
      {
        url: createFlatSvgPlaceholder("#b91c1c", "CHILLER COMPRESSOR ISSUE", "Telegram Attached • Main Branch"),
        fileId: "tg_chiller_1001",
        fileName: "chiller_damage.jpg"
      }
    ],
    requesterId: "user_requester1",
    requesterName: "Maria Clara",
    requesterEmail: "maria.clara@successo.ph",
    contactNumber: "+639170000005",
    branchId: "branch_main",
    branchName: "Successo Store - Main Branch",
    requestedDueDate: todayDateStr,
    priority: "urgent",
    status: "submitted", // submitted | assigned | in_progress | pending_confirmation | resolved | rejected
    assignedType: "",
    assignedPersonnelId: "",
    assignedPersonnelName: "",
    externalLaborDetails: "",
    reportedAt: formatIso(4),
    triagedAt: "",
    triagedBy: "",
    doneAt: "",
    doneNotes: "",
    doneProofUrl: "",
    resolvedAt: "",
    rejectionReason: ""
  },
  // 2. Triaged & Assigned: Internal Personnel working (Reported 26h ago -> Yellow SLA warning)
  {
    id: "TICK-1002",
    concernType: "Asset & Tools",
    title: "POS terminal #2 barcode scanner & thermal printer offline",
    description: "Checkout counter scanner cannot read QR codes, thermal roll feed motor jammed.",
    attachments: [
      {
        url: createFlatSvgPlaceholder("#d97706", "POS SCANNER OFFLINE", "Telegram Attached • Makati Branch"),
        fileId: "tg_pos_1002",
        fileName: "pos_failure.jpg"
      }
    ],
    requesterId: "user_requester2",
    requesterName: "Jose Rizal",
    requesterEmail: "jose.rizal@successo.ph",
    contactNumber: "+639170000006",
    branchId: "branch_makati",
    branchName: "Successo Store - Makati Branch",
    requestedDueDate: todayDateStr,
    priority: "high",
    status: "assigned",
    assignedType: "internal",
    assignedPersonnelId: "user_personnel1",
    assignedPersonnelName: "Juan Dela Cruz (Maintenance & Facilities)",
    externalLaborDetails: "",
    reportedAt: formatIso(26),
    triagedAt: formatIso(24),
    triagedBy: "headadmin",
    doneAt: "",
    doneNotes: "",
    doneProofUrl: "",
    resolvedAt: "",
    rejectionReason: ""
  },
  // 3. Marked Done by Personnel: Waiting for Requester Confirmation (Reported 54h ago -> Red SLA Alert)
  {
    id: "TICK-1003",
    concernType: "Supply & Inventory",
    title: "Warehouse pallet storage racking anchor loose",
    description: "Heavy inventory racking unit C-4 shifted out of alignment during forklift restock.",
    attachments: [
      {
        url: createFlatSvgPlaceholder("#475569", "DAMAGED RACK BEAM", "Telegram Attached • Central Hub"),
        fileId: "tg_rack_1003",
        fileName: "rack_shift.jpg"
      }
    ],
    requesterId: "user_requester1",
    requesterName: "Maria Clara",
    requesterEmail: "maria.clara@successo.ph",
    contactNumber: "+639170000005",
    branchId: "branch_hub",
    branchName: "Successo Central Logistics Hub",
    requestedDueDate: todayDateStr,
    priority: "urgent",
    status: "pending_confirmation",
    assignedType: "external",
    assignedPersonnelId: "",
    assignedPersonnelName: "Metro Structural Fabricators Inc.",
    externalLaborDetails: "Metro Structural Fabricators Inc. (Contractor: Engr. Reyes, +639185551234)",
    reportedAt: formatIso(54),
    triagedAt: formatIso(50),
    triagedBy: "headadmin",
    doneAt: formatIso(2),
    doneNotes: "Reinforced baseplates with M16 heavy epoxy anchors. Structural load certified safe up to 3,500kg.",
    doneProofUrl: createFlatSvgPlaceholder("#16a34a", "REINFORCED ANCHOR REPAIR", "Proof Photo Uploaded via Telegram"),
    resolvedAt: "",
    rejectionReason: ""
  },
  // 4. Confirmed & Resolved: Closed officially by Requester (Reported 70h ago, resolved in 14h)
  {
    id: "TICK-1004",
    concernType: "Accounting",
    title: "Petty cash vault electronic keypad battery failure",
    description: "Keypad solenoid locked out after low battery warning; urgent need for safe override.",
    attachments: [
      {
        url: createFlatSvgPlaceholder("#334155", "KEYPAD ERROR CODE 04", "Telegram Attached • Makati Branch"),
        fileId: "tg_vault_1004",
        fileName: "vault_keypad.jpg"
      }
    ],
    requesterId: "user_requester2",
    requesterName: "Jose Rizal",
    requesterEmail: "jose.rizal@successo.ph",
    contactNumber: "+639170000006",
    branchId: "branch_makati",
    branchName: "Successo Store - Makati Branch",
    requestedDueDate: "2026-11-04",
    priority: "medium",
    status: "resolved",
    assignedType: "internal",
    assignedPersonnelId: "user_personnel2",
    assignedPersonnelName: "Pedro Santos (IT & Asset Specialist)",
    externalLaborDetails: "",
    reportedAt: formatIso(70),
    triagedAt: formatIso(68),
    triagedBy: "headadmin",
    doneAt: formatIso(56),
    doneNotes: "Replaced 9V alkaline backup pack and reset master administrative PIN. Vault verified functional.",
    doneProofUrl: createFlatSvgPlaceholder("#16a34a", "KEYPAD RESTORED", "Proof Verified"),
    resolvedAt: formatIso(54),
    rejectionReason: ""
  }
];

/* ==========================================================================
   2. APPLICATION STATE & FIRESTORE HYBRID SETUP
   ========================================================================== */
let db = null;

let state = {
  currentUser: null,
  stores: [],
  users: [],
  tickets: [],
  notifications: [],
  settings: { ...DEFAULT_SETTINGS },
  activeTab: "panel-dashboard",
  statusFilter: "all",
  priorityFilter: "all",
  concernFilter: "all",
  searchQuery: "",
  userRoleFilter: "all",
  userSearchQuery: "",
  todayOnlyTaskFilter: true, // for Personnel view
  pendingReportPhotoDataUrl: "",
  pendingReportPhotoBlob: null,
  pendingFixPhotoDataUrl: "",
  pendingFixPhotoBlob: null
};

// SVG Icons for clean Flat UI buttons
const ICONS = {
  dashboard: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>`,
  tickets: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>`,
  reports: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`,
  stores: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`,
  users: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>`,
  settings: `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
  edit: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>`,
  delete: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`,
  view: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`,
  check: `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
};

/* ==========================================================================
   3. PERSISTENCE & INITIALIZATION
   ========================================================================== */
function loadLocalState() {
  try {
    const rawStores = localStorage.getItem(LS_KEYS.STORES);
    state.stores = rawStores ? JSON.parse(rawStores) : [...DEFAULT_STORES];

    const rawUsers = localStorage.getItem(LS_KEYS.USERS);
    state.users = rawUsers ? JSON.parse(rawUsers) : [...DEFAULT_USERS];

    // Ensure all user profiles have email
    state.users.forEach(u => {
      if (!u.email) {
        const empMatch = PREPOPULATED_EMPLOYEES.find(e => e.name.toLowerCase() === (u.displayName || "").toLowerCase());
        u.email = empMatch?.email || `${u.username}@successo.ph`;
      }
    });

    const rawTickets = localStorage.getItem(LS_KEYS.TICKETS);
    state.tickets = rawTickets ? JSON.parse(rawTickets) : [...DEFAULT_TICKETS];

    const rawSettings = localStorage.getItem(LS_KEYS.SETTINGS);
    state.settings = rawSettings ? { ...DEFAULT_SETTINGS, ...JSON.parse(rawSettings) } : { ...DEFAULT_SETTINGS };

    const rawSession = localStorage.getItem(LS_KEYS.SESSION);
    if (rawSession) {
      const parsedSession = JSON.parse(rawSession);
      state.currentUser = state.users.find(u => u.username === parsedSession.username) || parsedSession;
    }
  } catch (err) {
    console.warn("Error reading local state, falling back to defaults:", err);
    state.stores = [...DEFAULT_STORES];
    state.users = [...DEFAULT_USERS];
    state.tickets = [...DEFAULT_TICKETS];
  }
}

function saveLocalState() {
  try {
    localStorage.setItem(LS_KEYS.STORES, JSON.stringify(state.stores));
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(state.users));
    localStorage.setItem(LS_KEYS.TICKETS, JSON.stringify(state.tickets));
    localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(state.settings));
    if (state.currentUser) {
      localStorage.setItem(LS_KEYS.SESSION, JSON.stringify(state.currentUser));
    } else {
      localStorage.removeItem(LS_KEYS.SESSION);
    }
  } catch (err) {
    console.error("Local storage save error:", err);
  }
}

async function initFirebaseAndSync() {
  try {
    const app = getApps().length ? getApps()[0] : initializeApp(DEFAULT_FIREBASE_CONFIG);
    db = getFirestore(app);

    // Sync Firestore Tickets
    onSnapshot(collection(db, COLLECTIONS.TICKETS), (snap) => {
      if (!snap.empty) {
        const remote = [];
        snap.forEach(docSnap => remote.push({ id: docSnap.id, ...docSnap.data() }));
        state.tickets = remote;
        localStorage.setItem(LS_KEYS.TICKETS, JSON.stringify(remote));
        renderAllViews();
      }
    }, (err) => console.log("Firestore offline/fallback active:", err.message));

    const connIndicator = document.getElementById("db-conn-indicator");
    if (connIndicator) connIndicator.textContent = "DB: Firebase Live • Storage: Telegram";
  } catch (err) {
    console.warn("Firebase initialization note (offline mode available):", err);
  }
}

async function persistTicket(ticket) {
  const existingIdx = state.tickets.findIndex(t => t.id === ticket.id);
  if (existingIdx >= 0) {
    state.tickets[existingIdx] = { ...ticket };
  } else {
    state.tickets.unshift({ ...ticket });
  }
  saveLocalState();

  if (db) {
    try {
      await setDoc(doc(db, COLLECTIONS.TICKETS, ticket.id), ticket, { merge: true });
    } catch (err) {
      console.warn("Firebase sync postponed, saved locally:", err.message);
    }
  }
}

/* ==========================================================================
   4. 72-HOUR SLA ENGINE & DYNAMIC COLOR-CODING
   ========================================================================== */
function getTicketSlaInfo(ticket) {
  const maxHours = state.settings.slaHoursMax || 72;
  const reportedMs = new Date(ticket.reportedAt).getTime();
  const endMs = ticket.status === "resolved" && ticket.resolvedAt
    ? new Date(ticket.resolvedAt).getTime()
    : Date.now();

  const elapsedMs = Math.max(0, endMs - reportedMs);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const remainingHours = Math.max(0, maxHours - elapsedHours);

  const h = Math.floor(elapsedHours);
  const m = Math.floor((elapsedHours % 1) * 60);
  const elapsedFormatted = `${h}h ${m}m`;

  if (ticket.status === "resolved") {
    return {
      tier: "resolved",
      badgeClass: "sla-resolved",
      label: `RESOLVED (${elapsedFormatted})`,
      elapsedHours,
      remainingHours: 0,
      isBreached: elapsedHours > maxHours
    };
  }

  if (elapsedHours >= maxHours) {
    const overdueH = Math.floor(elapsedHours - maxHours);
    return {
      tier: "breached",
      badgeClass: "sla-breached",
      label: `SLA BREACHED (+${overdueH}h)`,
      elapsedHours,
      remainingHours: 0,
      isBreached: true
    };
  }

  if (elapsedHours >= 48) {
    return {
      tier: "danger",
      badgeClass: "sla-red",
      label: `SLA RISK (${Math.floor(remainingHours)}h left)`,
      elapsedHours,
      remainingHours,
      isBreached: false
    };
  }

  if (elapsedHours >= 24) {
    return {
      tier: "warning",
      badgeClass: "sla-yellow",
      label: `WARNING (${Math.floor(remainingHours)}h left)`,
      elapsedHours,
      remainingHours,
      isBreached: false
    };
  }

  return {
    tier: "good",
    badgeClass: "sla-green",
    label: `ON TRACK (${elapsedFormatted})`,
    elapsedHours,
    remainingHours,
    isBreached: false
  };
}

/* ==========================================================================
   5. TELEGRAM BOT STORAGE & CAMERA INTEGRATION
   ========================================================================== */
async function uploadPhotoViaTelegram(blob, dataUrl, captionText) {
  const token = (state.settings.tgBotToken || "").trim();
  const chatId = (state.settings.tgChatId || "").trim();

  // If credentials are blank, return reliable local cached payload
  if (!token || !chatId) {
    return {
      url: dataUrl,
      fileId: `tg_local_${Date.now()}`,
      status: "Local DataURL (Telegram token unconfigured)"
    };
  }

  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("photo", blob, `helpdesk_${Date.now()}.jpg`);
    formData.append("caption", (captionText || "Helpdesk Attachment").slice(0, 1000));

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: formData
    });
    const json = await res.json();

    if (!json.ok || !json.result?.photo) {
      throw new Error(json.description || "Telegram upload failed");
    }

    const photos = json.result.photo;
    const best = photos[photos.length - 1];
    const fileId = best.file_id;

    // Fetch direct file path
    let resolvedUrl = dataUrl;
    try {
      const getFileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
      const getFileJson = await getFileRes.json();
      if (getFileJson.ok && getFileJson.result?.file_path) {
        resolvedUrl = `https://api.telegram.org/file/bot${token}/${getFileJson.result.file_path}`;
      }
    } catch (_) {
      resolvedUrl = dataUrl;
    }

    return {
      url: resolvedUrl,
      fileId: fileId,
      status: "Uploaded to Telegram"
    };
  } catch (err) {
    console.warn("Telegram API upload failed, using local fallback:", err.message);
    return {
      url: dataUrl,
      fileId: `tg_fallback_${Date.now()}`,
      status: "Fallback Local Cache"
    };
  }
}

/* Camera Stream State */
let cameraMediaStream = null;
let cameraFacingMode = "environment";
let currentCameraTarget = "report"; // 'report' or 'fix'

async function startDeviceCamera(target) {
  currentCameraTarget = target;
  const dialog = document.getElementById("dialog-camera-capture");
  const video = document.getElementById("camera-video-stream");
  const preview = document.getElementById("camera-snapshot-preview");
  const controlsLive = document.getElementById("camera-live-controls");
  const controlsReview = document.getElementById("camera-review-controls");
  const errorBox = document.getElementById("camera-error-msg");

  if (!dialog || !video) return;

  preview.classList.add("hidden");
  controlsReview.classList.add("hidden");
  controlsLive.classList.remove("hidden");
  errorBox.classList.add("hidden");
  if (!dialog.open) dialog.showModal();

  if (cameraMediaStream) {
    cameraMediaStream.getTracks().forEach(t => t.stop());
    cameraMediaStream = null;
  }

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Device camera API not supported on this browser or insecure context (requires HTTPS or localhost). Please use the file/photo upload button.");
    }

    cameraMediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = cameraMediaStream;
  } catch (err) {
    console.warn("Camera access note:", err);
    errorBox.classList.remove("hidden");
    const errText = document.getElementById("camera-error-text");
    if (errText) errText.textContent = err.message || "Camera access unavailable. Tap below to capture or select from files.";
  }
}

function stopDeviceCamera() {
  if (cameraMediaStream) {
    cameraMediaStream.getTracks().forEach(t => t.stop());
    cameraMediaStream = null;
  }
  const dialog = document.getElementById("dialog-camera-capture");
  if (dialog?.open) dialog.close();
}

function snapPhotoFromCamera() {
  const video = document.getElementById("camera-video-stream");
  const canvas = document.getElementById("camera-snapshot-canvas");
  const preview = document.getElementById("camera-snapshot-preview");
  const controlsLive = document.getElementById("camera-live-controls");
  const controlsReview = document.getElementById("camera-review-controls");

  if (!video || !canvas) return;

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  preview.src = dataUrl;
  preview.classList.remove("hidden");
  controlsLive.classList.add("hidden");
  controlsReview.classList.remove("hidden");

  canvas.toBlob((blob) => {
    if (currentCameraTarget === "report") {
      state.pendingReportPhotoDataUrl = dataUrl;
      state.pendingReportPhotoBlob = blob;
      const wrap = document.getElementById("report-photo-preview-wrap");
      const img = document.getElementById("report-photo-preview");
      if (wrap && img) { img.src = dataUrl; wrap.classList.remove("hidden"); }
      const hint = document.getElementById("report-upload-hint");
      if (hint) hint.textContent = "Camera snapshot ready for submission.";
    } else {
      state.pendingFixPhotoDataUrl = dataUrl;
      state.pendingFixPhotoBlob = blob;
      const wrap = document.getElementById("fix-photo-preview-wrap");
      const img = document.getElementById("fix-photo-preview");
      if (wrap && img) { img.src = dataUrl; wrap.classList.remove("hidden"); }
      const hint = document.getElementById("fix-upload-hint");
      if (hint) hint.textContent = "Repair proof photo ready.";
    }
  }, "image/jpeg", 0.85);
}

function handleUploadedFile(file, target) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (re) => {
    const dataUrl = re.target.result;
    if (target === "report") {
      state.pendingReportPhotoDataUrl = dataUrl;
      state.pendingReportPhotoBlob = file;
      const wrap = document.getElementById("report-photo-preview-wrap");
      const img = document.getElementById("report-photo-preview");
      const hint = document.getElementById("report-upload-hint");
      if (wrap && img) {
        if (file.type.startsWith("image/")) {
          img.src = dataUrl;
        } else {
          img.src = createFlatSvgPlaceholder("#475569", "DOCUMENT ATTACHED", file.name);
        }
        wrap.classList.remove("hidden");
      }
      if (hint) hint.textContent = `Attached: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      showToast(`Attached ${file.name}`, "success");
      setSubmitModalStep(2);
    } else {
      state.pendingFixPhotoDataUrl = dataUrl;
      state.pendingFixPhotoBlob = file;
      const wrap = document.getElementById("fix-photo-preview-wrap");
      const img = document.getElementById("fix-photo-preview");
      const hint = document.getElementById("fix-upload-hint");
      if (wrap && img) {
        if (file.type.startsWith("image/")) {
          img.src = dataUrl;
        } else {
          img.src = createFlatSvgPlaceholder("#16a34a", "PROOF ATTACHED", file.name);
        }
        wrap.classList.remove("hidden");
      }
      if (hint) hint.textContent = `Proof Attached: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      showToast(`Proof attached: ${file.name}`, "success");
    }
  };
  reader.readAsDataURL(file);
}

/* ==========================================================================
   6. UI RENDERING & PERSONA-SPECIFIC NAVIGATION
   ========================================================================== */
function getRoleTabs(role) {
  if (role === "superadmin") {
    return [
      { id: "panel-dashboard", label: "Executive Overview", iconSvg: ICONS.dashboard },
      { id: "panel-tickets", label: "All Tickets & Triage", iconSvg: ICONS.tickets },
      { id: "panel-reports", label: "Reports & Analytics", iconSvg: ICONS.reports },
      { id: "panel-stores", label: "Branches Directory", iconSvg: ICONS.stores },
      { id: "panel-users", label: "Users & Personnel", iconSvg: ICONS.users },
      { id: "panel-settings", label: "System Settings", iconSvg: ICONS.settings }
    ];
  }
  if (role === "headadmin") {
    return [
      { id: "panel-dashboard", label: "Triage & SLA Command", iconSvg: ICONS.dashboard },
      { id: "panel-tickets", label: "Tickets & Assignments", iconSvg: ICONS.tickets },
      { id: "panel-reports", label: "Reports & Analytics", iconSvg: ICONS.reports },
      { id: "panel-stores", label: "Branches Reference", iconSvg: ICONS.stores }
    ];
  }
  if (role === "personnel") {
    return [
      { id: "panel-dashboard", label: "My Tasks", iconSvg: ICONS.dashboard },
      { id: "panel-tickets", label: "All Assigned Tasks", iconSvg: ICONS.tickets }
    ];
  }
  // Requester (Employee)
  return [
    { id: "panel-dashboard", label: "Home", iconSvg: ICONS.dashboard },
    { id: "panel-tickets", label: "Tickets", iconSvg: ICONS.tickets }
  ];
}

function showToast(message, type = "info") {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
  const target = document.getElementById(tabId);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-item-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  document.querySelectorAll(".js-mobile-nav-tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  renderAllViews();
}

function renderSidebarNavigation() {
  const list = document.getElementById("desktop-nav-list");
  if (!list || !state.currentUser) return;

  const tabs = getRoleTabs(state.currentUser.role);
  list.innerHTML = tabs.map(t => `
    <li>
      <button type="button" class="nav-item-btn ${state.activeTab === t.id ? "active" : ""}" data-tab="${t.id}">
        <span class="nav-icon" aria-hidden="true">${t.iconSvg}</span>
        <span>${t.label}</span>
      </button>
    </li>
  `).join("");

  list.querySelectorAll(".nav-item-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function renderQuickSwitchBar() {
  const bar = document.getElementById("quick-switch-bar");
  if (!bar) return;

  const personas = [
    { user: "requester1", role: "REQUESTER", name: "Maria Clara (Employee)" },
    { user: "headadmin", role: "HEAD ADMIN", name: "Triage Admin" },
    { user: "personnel1", role: "PERSONNEL", name: "Juan Dela Cruz (Staff)" },
    { user: "superadmin", role: "SUPERADMIN", name: "System SuperAdmin" }
  ];

  bar.innerHTML = personas.map(p => `
    <button type="button" class="btn btn-outline btn-sm js-switch-persona ${state.currentUser?.username === p.user ? "btn-primary" : ""}" data-username="${p.user}">
      <strong>${p.role}:</strong> ${p.name}
    </button>
  `).join("");

  bar.querySelectorAll(".js-switch-persona").forEach(b => {
    b.addEventListener("click", () => {
      const u = state.users.find(x => x.username === b.dataset.username);
      if (u) {
        state.currentUser = u;
        saveLocalState();
        showToast(`Switched persona to ${u.displayName} (${u.role.toUpperCase()})`, "success");
        renderAllViews();
      }
    });
  });
}

function renderLoginAccountSelector() {
  const container = document.getElementById("login-accounts-list");
  if (!container) return;

  const demoAccounts = [
    { user: "requester1", pass: "requester1", label: "Requester (Employee)", name: "Maria Clara", role: "requester", badge: "badge-primary" },
    { user: "headadmin", pass: "headadmin", label: "Head Admin (Triage)", name: "Triage Admin", role: "headadmin", badge: "badge-warning" },
    { user: "personnel1", pass: "personnel1", label: "Personnel (Internal)", name: "Juan Dela Cruz", role: "personnel", badge: "badge-success" },
    { user: "superadmin", pass: "superadmin", label: "Superadmin", name: "System SuperAdmin", role: "superadmin", badge: "badge-purple" }
  ];

  container.innerHTML = demoAccounts.map(a => `
    <div class="account-card-item js-quick-login-card" data-user="${a.user}" data-pass="${a.pass}" style="cursor:pointer;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; width:100%;">
        <div>
          <div style="font-weight:700; font-size:0.83rem;">${a.name}</div>
          <div class="mono text-xs text-muted">${a.user} / ${a.pass} &bull; ${a.label}</div>
        </div>
        <span class="badge ${a.badge}" style="font-size:0.65rem;">${a.role.toUpperCase()}</span>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".js-quick-login-card").forEach(card => {
    card.addEventListener("click", () => {
      document.getElementById("login-username").value = card.dataset.user;
      document.getElementById("login-password").value = card.dataset.pass;
      handleLogin(card.dataset.user, card.dataset.pass);
    });
  });
}

/* ==========================================================================
   7. DASHBOARD RENDERING (Role-Specific)
   ========================================================================== */
function renderDashboardUI() {
  const container = document.getElementById("role-dashboard-container");
  if (!container || !state.currentUser) return;

  const role = state.currentUser.role;

  // 1. REQUESTER VIEW: Mobile-First Guided UI + Desktop Table
  if (role === "requester") {
    const myTickets = state.tickets.filter(t => t.requesterId === state.currentUser.id || (t.requesterName && t.requesterName.toLowerCase().includes(state.currentUser.displayName.toLowerCase())));
    const pendingConfirm = myTickets.filter(t => t.status === "pending_confirmation");
    const activeTickets = myTickets.filter(t => t.status !== "resolved");

    container.innerHTML = `
      <!-- Mobile-First Guided Header (Mobile View: <= 768px) -->
      <div class="mobile-only">
        <div class="mobile-requester-guide">
          <div class="guide-welcome" style="margin-bottom:0.75rem;">
            <div class="guide-avatar">🏪</div>
            <div>
              <h2 class="guide-title">Hello, ${escapeHtml(state.currentUser.displayName)}! 👋</h2>
              <p class="guide-subtitle">📍 <strong>${escapeHtml(state.currentUser.branchName || "Main Branch")}</strong> &bull; ${escapeHtml(state.currentUser.department || "Store Staff")}</p>
            </div>
          </div>

          <!-- 3-Step Guided Workflow Banner -->
          <div class="mobile-steps-banner">
            <div class="mobile-step-item">
              <div class="mobile-step-num">1</div>
              <div class="mobile-step-text"><strong>1. Report Issue</strong>Tap (+) at bottom</div>
            </div>
            <div class="mobile-step-arrow">&rarr;</div>
            <div class="mobile-step-item">
              <div class="mobile-step-num" style="background:var(--warning); color:#fff;">2</div>
              <div class="mobile-step-text"><strong>2. Assigned</strong>Repair in progress</div>
            </div>
            <div class="mobile-step-arrow">&rarr;</div>
            <div class="mobile-step-item">
              <div class="mobile-step-num" style="background:var(--success); color:#fff;">3</div>
              <div class="mobile-step-text"><strong>3. Confirm Fix</strong>Verify resolution</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Desktop Header Bar (Desktop View: > 768px) -->
      <div class="desktop-only">
        <div class="page-header-bar">
          <div>
            <h2 class="page-title">Welcome, ${escapeHtml(state.currentUser.displayName)}</h2>
            <p class="text-sm text-muted">Branch: <strong>${escapeHtml(state.currentUser.branchName || "Main")}</strong> &bull; Email: <strong>${escapeHtml(state.currentUser.email || "—")}</strong> &bull; Dept: <strong>${escapeHtml(state.currentUser.department || "Employee")}</strong></p>
          </div>
          <div>
            <button type="button" class="btn btn-primary js-trigger-submit-modal">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
              <span>Submit New Ticket</span>
            </button>
          </div>
        </div>
      </div>

      ${pendingConfirm.length > 0 ? `
        <div class="action-needed-banner" style="margin-bottom:1.25rem; border-color:var(--purple); background:#faf5ff;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span class="pulse-indicator" style="background:var(--purple); width:12px; height:12px;"></span>
            <div>
              <strong style="color:var(--purple); font-size:0.95rem;">🎉 Action Required: ${pendingConfirm.length} Ticket(s) Completed by Technician!</strong>
              <div class="text-xs" style="color:#6b21a8; margin-top:0.2rem;">
                The technician has marked the repair as completed. Please review the proof photos and confirm or reject resolution.
              </div>
            </div>
          </div>
        </div>
      ` : ""}

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Requests</div>
          <div class="kpi-value">${myTickets.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--primary);">In Progress</div>
          <div class="kpi-value" style="color:var(--primary);">${activeTickets.length}</div>
        </div>
        <div class="kpi-card" style="${pendingConfirm.length > 0 ? "border:2px solid var(--purple); background:#faf5ff;" : ""}">
          <div class="kpi-label" style="color:var(--purple);">Pending Confirmation</div>
          <div class="kpi-value" style="color:var(--purple);">${pendingConfirm.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--success);">Resolved &amp; Closed</div>
          <div class="kpi-value" style="color:var(--success);">${myTickets.filter(t => t.status === "resolved").length}</div>
        </div>
      </div>

      <!-- Dedicated Tickets Table Link Card (Replaces in-home cards) -->
      <div class="card" style="margin-top:1.25rem; padding:1.75rem 1.25rem; text-align:center;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:0.5rem;">
          <div style="width:48px; height:48px; border-radius:50%; background:var(--primary-soft); color:var(--primary); display:flex; align-items:center; justify-content:center;">
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 02-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
            </svg>
          </div>
          <h3 style="font-size:1.05rem; font-weight:800; color:var(--text-primary); margin:0.25rem 0 0 0;">View &amp; Track Requests in Tickets Table</h3>
          <p class="text-xs text-muted" style="max-width:340px; margin:0 0 0.85rem 0; line-height:1.5;">
            All your submitted tickets, repair status, and verification actions are listed in your dedicated Tickets table.
          </p>
          <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" onclick="switchTab('panel-tickets')" style="font-weight:700;">
              <span>Open Tickets Table &rarr;</span>
            </button>
            <button type="button" class="btn btn-outline js-trigger-submit-modal" style="font-weight:600;">
              <span>+ Report New Issue</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // 2. HEAD ADMIN VIEW: Triage queue with elapsed time display, SLA risk alarms
  else if (role === "headadmin") {
    const unassigned = state.tickets.filter(t => t.status === "submitted");
    const slaRisks = state.tickets.filter(t => {
      const sla = getTicketSlaInfo(t);
      return t.status !== "resolved" && (sla.tier === "warning" || sla.tier === "danger" || sla.tier === "breached");
    });

    container.innerHTML = `
      <div class="page-header-bar">
        <div>
          <h2 class="page-title">Head Admin Triage &amp; SLA Command Center</h2>
          <p class="text-sm text-muted">Review incoming requests, monitor elapsed time, assign internal/external labor, and prevent 72h SLA breaches.</p>
        </div>
        <div>
          <button type="button" class="btn btn-outline btn-sm" onclick="switchTab('panel-reports')">
            ${ICONS.reports} <span>Daily Reports</span>
          </button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--primary);">Needs Triage (Unassigned)</div>
          <div class="kpi-value" style="color:var(--primary);">${unassigned.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--danger);">SLA Risk / Overdue (&gt;24h)</div>
          <div class="kpi-value" style="color:var(--danger);">${slaRisks.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--warning);">In Progress / Dispatched</div>
          <div class="kpi-value" style="color:var(--warning);">${state.tickets.filter(t => t.status === "assigned" || t.status === "in_progress" || t.status === "rejected").length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--success);">Resolved Tickets</div>
          <div class="kpi-value" style="color:var(--success);">${state.tickets.filter(t => t.status === "resolved").length}</div>
        </div>
      </div>

      <!-- Triage Queue Card with ELAPSED TIME DISPLAY -->
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 class="section-title">New Ticket Triage Queue</h3>
            <p class="text-xs text-muted">Review elapsed time from time posted, set priority level &amp; dispatch tasks</p>
          </div>
          <span class="badge badge-primary">${unassigned.length} Pending Triage</span>
        </div>
        <div class="flat-table-responsive" style="border:none;">
          <table class="flat-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Concern Type</th>
                <th>Title</th>
                <th>Requester &amp; Branch</th>
                <th>Elapsed Time &amp; SLA</th>
                <th style="text-align:right;">Triage Action</th>
              </tr>
            </thead>
            <tbody>
              ${unassigned.length === 0 ? `<tr><td colspan="6" style="text-align:center; padding:2rem;">All tickets have been triaged and dispatched. Great job!</td></tr>` :
                unassigned.map(t => {
                  const sla = getTicketSlaInfo(t);
                  return `
                    <tr class="clickable-row js-open-ticket-details" data-id="${t.id}" style="cursor:pointer;" title="Click to view details">
                      <td class="mono font-bold">${t.id}</td>
                      <td><span class="badge badge-concern">${t.concernType}</span></td>
                      <td><strong>${escapeHtml(t.title)}</strong></td>
                      <td>
                        <div>${escapeHtml(t.requesterName)}</div>
                        <div class="text-xs text-muted">${escapeHtml(t.branchName)}</div>
                      </td>
                      <td>
                        <span class="sla-badge ${sla.badgeClass}">${sla.label}</span>
                        <div class="text-xs text-muted mono" style="margin-top:0.25rem;">Posted: ${formatDateStr(t.reportedAt)}</div>
                      </td>
                      <td style="text-align:right;" onclick="event.stopPropagation();">
                        <button type="button" class="btn btn-primary btn-sm js-open-triage-modal" data-id="${t.id}">
                          Triage &amp; Assign
                        </button>
                      </td>
                    </tr>
                  `;
                }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 3. PERSONNEL VIEW: Clickable tasks to view details, attachments, history + rejected rework handling
  else if (role === "personnel") {
    const myTasks = state.tickets.filter(t => t.assignedPersonnelId === state.currentUser.id || (t.assignedPersonnelName && t.assignedPersonnelName.toLowerCase().includes(state.currentUser.displayName.toLowerCase())));
    const rejectedTasks = myTasks.filter(t => t.status === "rejected");
    // Ensure rejected tasks are ALWAYS included in today's active tasks!
    const todayTasks = myTasks.filter(t => t.requestedDueDate === todayDateStr || t.status === "assigned" || t.status === "in_progress" || t.status === "rejected");
    const displayedTasks = state.todayOnlyTaskFilter ? todayTasks : myTasks;

    container.innerHTML = `
      <div class="page-header-bar">
        <div>
          <h2 class="page-title">Personnel Tasks: ${escapeHtml(state.currentUser.displayName)}</h2>
          <p class="text-sm text-muted">Assigned Queue &bull; Click any task to inspect attachments and history &bull; Turnaround: <strong>72 Hours</strong></p>
        </div>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <button type="button" class="btn ${state.todayOnlyTaskFilter ? "btn-primary" : "btn-outline"} btn-sm js-toggle-personnel-today">
            ${state.todayOnlyTaskFilter ? "&#10003; Showing: Active & Today's Tasks" : "Show: Today's Tasks Only"}
          </button>
        </div>
      </div>

      ${rejectedTasks.length > 0 ? `
        <div class="action-needed-banner" style="background:#fef2f2; border:1px solid #fecaca; margin-bottom:1.25rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span class="pulse-indicator" style="background:var(--danger);"></span>
            <div>
              <strong style="color:var(--danger);">Rework Required: ${rejectedTasks.length} Task(s) Returned by Requester</strong>
              <div class="text-xs" style="color:#7f1d1d;">Requester inspected the resolution and requested changes. Click the task to view feedback and submit rework proof.</div>
            </div>
          </div>
        </div>
      ` : ""}

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Tasks to Do Today</div>
          <div class="kpi-value" style="color:var(--primary);">${todayTasks.filter(t => t.status !== "resolved").length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--danger);">Rework Required (Rejected)</div>
          <div class="kpi-value" style="color:var(--danger);">${rejectedTasks.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--purple);">Awaiting Confirmation</div>
          <div class="kpi-value" style="color:var(--purple);">${myTasks.filter(t => t.status === "pending_confirmation").length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--success);">Completed &amp; Confirmed</div>
          <div class="kpi-value" style="color:var(--success);">${myTasks.filter(t => t.status === "resolved").length}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 class="section-title">My Assigned Tasks</h3>
            <p class="text-xs text-muted">Click any task row to view details, photos/attachments, and timeline history</p>
          </div>
          <span class="badge badge-neutral">${displayedTasks.length} Tasks</span>
        </div>
        <div class="flat-table-responsive" style="border:none;">
          <table class="flat-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Priority</th>
                <th>Concern Type</th>
                <th>Title &amp; Location</th>
                <th>Due Date</th>
                <th>SLA Elapsed</th>
                <th>Status</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${displayedTasks.length === 0 ? `<tr><td colspan="8" style="text-align:center; padding:2rem;">No pending tasks in this view. You are all caught up!</td></tr>` :
                displayedTasks.map(t => {
                  const sla = getTicketSlaInfo(t);
                  const isRework = t.status === "rejected";
                  return `
                    <tr class="clickable-row js-open-ticket-details" data-id="${t.id}" style="cursor:pointer; ${isRework ? "background:#fff5f5;" : ""}" title="Click to view full ticket details and attachments">
                      <td class="mono font-bold">${t.id}</td>
                      <td>${getPriorityBadge(t.priority)}</td>
                      <td><span class="badge badge-concern">${t.concernType}</span></td>
                      <td>
                        <a href="javascript:void(0)" class="js-open-ticket-details" data-id="${t.id}" style="color:inherit; font-weight:700; text-decoration:none;">${escapeHtml(t.title)}</a>
                        <div class="text-xs text-muted">${escapeHtml(t.branchName)} &bull; Req: ${escapeHtml(t.requesterName)}</div>
                        ${isRework ? `<div class="text-xs" style="color:var(--danger); font-weight:700; margin-top:0.2rem;">⚠️ REWORK NOTE: "${escapeHtml(t.rejectionReason)}"</div>` : ""}
                      </td>
                      <td class="mono text-xs">${t.requestedDueDate || "ASAP"}</td>
                      <td><span class="sla-badge ${sla.badgeClass}">${sla.label}</span></td>
                      <td>${getStatusBadge(t.status)}</td>
                      <td style="text-align:right;" onclick="event.stopPropagation();">
                        <div style="display:flex; justify-content:flex-end; gap:0.35rem; align-items:center;">
                          <button type="button" class="btn btn-outline btn-sm js-open-ticket-details" data-id="${t.id}" title="View Details, Attachments & History">
                            ${ICONS.view}
                          </button>
                          ${(t.status === "assigned" || t.status === "in_progress" || isRework) ? `
                            <button type="button" class="btn ${isRework ? "btn-danger" : "btn-success"} btn-sm js-open-done-modal" data-id="${t.id}" title="${isRework ? "Upload Rework Proof" : "Mark as Done"}">
                              ${ICONS.check} ${isRework ? "Rework Done" : "Mark Done"}
                            </button>
                          ` : ""}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelector(".js-toggle-personnel-today")?.addEventListener("click", () => {
      state.todayOnlyTaskFilter = !state.todayOnlyTaskFilter;
      renderDashboardUI();
    });
  }

  // 4. SUPERADMIN VIEW: Global metrics, SLA health, full controls
  else {
    const unassigned = state.tickets.filter(t => t.status === "submitted");
    const pendingConfirm = state.tickets.filter(t => t.status === "pending_confirmation");
    const active = state.tickets.filter(t => t.status !== "resolved");
    const breached = state.tickets.filter(t => getTicketSlaInfo(t).isBreached);

    container.innerHTML = `
      <div class="page-header-bar">
        <div>
          <h2 class="page-title">Executive Operations Command</h2>
          <p class="text-sm text-muted">Global oversight &bull; Users: <strong>${state.users.length}</strong> &bull; Branches: <strong>${state.stores.length}</strong> &bull; 72-Hour SLA Status</p>
        </div>
        <div class="btn-group-responsive">
          <button type="button" class="btn btn-primary btn-sm js-trigger-submit-modal">
            ${ICONS.tickets} <span>New Ticket</span>
          </button>
          <button type="button" class="btn btn-outline btn-sm" onclick="switchTab('panel-reports')">
            ${ICONS.reports} <span>Reports &amp; Export</span>
          </button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total System Tickets</div>
          <div class="kpi-value">${state.tickets.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--primary);">Pending Triage</div>
          <div class="kpi-value" style="color:var(--primary);">${unassigned.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--purple);">Pending Confirmation</div>
          <div class="kpi-value" style="color:var(--purple);">${pendingConfirm.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--danger);">SLA Breaches (&gt;72h)</div>
          <div class="kpi-value" style="color:var(--danger);">${breached.length}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:1.25rem;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 class="section-title">Active Tickets Summary</h3>
            <p class="text-xs text-muted">Real-time status across all departments &bull; Click any ticket to inspect details</p>
          </div>
          <span class="badge badge-neutral">${active.length} Active</span>
        </div>
        <div class="flat-table-responsive" style="border:none;">
          <table class="flat-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Priority</th>
                <th>Department</th>
                <th>Title</th>
                <th>Branch</th>
                <th>Assigned To</th>
                <th>SLA Elapsed</th>
                <th>Status</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.tickets.slice(0, 8).map(t => {
                const sla = getTicketSlaInfo(t);
                return `
                  <tr class="clickable-row js-open-ticket-details" data-id="${t.id}" style="cursor:pointer;">
                    <td class="mono font-bold">${t.id}</td>
                    <td>${getPriorityBadge(t.priority)}</td>
                    <td><span class="badge badge-concern">${t.concernType}</span></td>
                    <td><strong>${escapeHtml(t.title)}</strong></td>
                    <td>${escapeHtml(t.branchName)}</td>
                    <td>${escapeHtml(t.assignedPersonnelName || (t.assignedType === "external" ? "External Labor" : "Unassigned"))}</td>
                    <td><span class="sla-badge ${sla.badgeClass}">${sla.label}</span></td>
                    <td>${getStatusBadge(t.status)}</td>
                    <td style="text-align:right;" onclick="event.stopPropagation();">
                      <div style="display:flex; justify-content:flex-end; gap:0.35rem;">
                        <button type="button" class="btn btn-outline btn-sm js-open-ticket-details" data-id="${t.id}" title="View details">
                          ${ICONS.view}
                        </button>
                        ${t.status === "submitted" ? `
                          <button type="button" class="btn btn-primary btn-sm js-open-triage-modal" data-id="${t.id}" title="Triage">
                            Triage
                          </button>
                        ` : ""}
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  attachDynamicActionListeners();
}

/* ==========================================================================
   8. ALL TICKETS TABLE & FILTERS
   ========================================================================== */
function renderTicketsSection() {
  const tbody = document.getElementById("tickets-table-tbody");
  const countBadge = document.getElementById("tickets-count-badge");
  const emptyState = document.getElementById("tickets-empty-state");
  if (!tbody) return;

  let filtered = [...state.tickets];

  // Role visibility scoping
  if (state.currentUser.role === "requester") {
    filtered = filtered.filter(t => t.requesterId === state.currentUser.id || (t.requesterName && t.requesterName.toLowerCase().includes(state.currentUser.displayName.toLowerCase())));
  } else if (state.currentUser.role === "personnel") {
    filtered = filtered.filter(t => t.assignedPersonnelId === state.currentUser.id || (t.assignedPersonnelName && t.assignedPersonnelName.toLowerCase().includes(state.currentUser.displayName.toLowerCase())));
  }

  // Status Filter
  if (state.statusFilter !== "all") {
    filtered = filtered.filter(t => t.status === state.statusFilter);
  }

  // Concern Type Filter
  const concernSelect = document.getElementById("filter-concern-type");
  if (concernSelect && concernSelect.value !== "all") {
    filtered = filtered.filter(t => t.concernType === concernSelect.value);
  }

  // Priority Filter
  const prioritySelect = document.getElementById("filter-priority");
  if (prioritySelect && prioritySelect.value !== "all") {
    filtered = filtered.filter(t => t.priority === prioritySelect.value);
  }

  // Search Query
  const searchInput = document.getElementById("search-tickets");
  if (searchInput && searchInput.value.trim()) {
    const q = searchInput.value.trim().toLowerCase();
    filtered = filtered.filter(t =>
      t.id.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      (t.requesterName && t.requesterName.toLowerCase().includes(q)) ||
      (t.branchName && t.branchName.toLowerCase().includes(q)) ||
      (t.assignedPersonnelName && t.assignedPersonnelName.toLowerCase().includes(q))
    );
  }

  if (countBadge) countBadge.textContent = `${filtered.length} Tickets`;

  // Update top KPI numbers
  const kpiTotal = document.getElementById("kpi-total");
  const kpiSub = document.getElementById("kpi-submitted");
  const kpiInProg = document.getElementById("kpi-in-progress");
  const kpiConfirm = document.getElementById("kpi-pending-confirm");
  const kpiResolved = document.getElementById("kpi-resolved");
  if (kpiTotal) kpiTotal.textContent = state.tickets.length;
  if (kpiSub) kpiSub.textContent = state.tickets.filter(t => t.status === "submitted").length;
  if (kpiInProg) kpiInProg.textContent = state.tickets.filter(t => t.status === "assigned" || t.status === "in_progress" || t.status === "rejected").length;
  if (kpiConfirm) kpiConfirm.textContent = state.tickets.filter(t => t.status === "pending_confirmation").length;
  if (kpiResolved) kpiResolved.textContent = state.tickets.filter(t => t.status === "resolved").length;

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) {
      emptyState.classList.remove("hidden");
      emptyState.innerHTML = `
        <div style="font-weight:700; color:var(--text-secondary); margin-bottom:0.25rem;">No matching tickets found</div>
        <p class="text-xs text-muted">Try adjusting search filters or submit a new ticket.</p>
      `;
    }
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  const thead = document.getElementById("tickets-table-thead");
  const isRequester = state.currentUser.role === "requester";

  if (thead) {
    if (isRequester) {
      thead.innerHTML = `
        <tr>
          <th style="min-width:105px;">Ticket ID</th>
          <th style="min-width:140px;">Concern Type</th>
          <th style="min-width:180px;">Title</th>
          <th style="min-width:130px;">SLA Elapsed</th>
          <th style="min-width:130px;">Status</th>
          <th style="text-align:right; min-width:120px;">Actions</th>
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr>
          <th style="min-width:110px;">Ticket ID</th>
          <th style="min-width:90px;">Priority</th>
          <th style="min-width:140px;">Concern Type</th>
          <th style="min-width:220px;">Title &amp; Requester</th>
          <th style="min-width:160px;">Branch / Location</th>
          <th style="min-width:160px;">Assigned Personnel</th>
          <th style="min-width:160px;">SLA &amp; Elapsed Time</th>
          <th style="min-width:140px;">Status</th>
          <th style="text-align:right; min-width:130px;">Actions</th>
        </tr>
      `;
    }
  }

  if (isRequester) {
    tbody.innerHTML = filtered.map(t => {
      const sla = getTicketSlaInfo(t);
      const icon = getConcernIcon(t.concernType);
      return `
        <tr class="clickable-row js-open-ticket-details" data-id="${t.id}" style="cursor:pointer;" title="Click row to view ticket details">
          <td class="mono font-bold">${t.id}</td>
          <td><span class="badge badge-concern">${icon} ${escapeHtml(t.concernType)}</span></td>
          <td>
            <a href="javascript:void(0)" class="js-open-ticket-details" data-id="${t.id}" style="color:inherit; font-weight:700; text-decoration:none;">${escapeHtml(t.title)}</a>
            ${t.status === "rejected" ? `<div class="text-xs" style="color:var(--danger); font-weight:600;">⚠️ Returned: "${escapeHtml(t.rejectionReason)}"</div>` : ""}
          </td>
          <td><span class="sla-badge ${sla.badgeClass}">${sla.label}</span></td>
          <td>${getStatusBadge(t.status)}</td>
          <td style="text-align:right;" onclick="event.stopPropagation();">
            <div style="display:flex; justify-content:flex-end; gap:0.4rem; align-items:center;">
              <button type="button" class="btn btn-outline btn-sm js-open-ticket-details" data-id="${t.id}" style="font-weight:700;">
                🔍 View
              </button>
              ${t.status === "pending_confirmation" ? `
                <button type="button" class="btn btn-success btn-sm js-open-confirm-modal" data-id="${t.id}" style="font-weight:700;">
                  Verify
                </button>
              ` : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  } else {
    tbody.innerHTML = filtered.map(t => {
      const sla = getTicketSlaInfo(t);
      return `
        <tr class="clickable-row js-open-ticket-details" data-id="${t.id}" style="cursor:pointer;" title="Click row to view ticket details">
          <td class="mono font-bold">${t.id}</td>
          <td>${getPriorityBadge(t.priority)}</td>
          <td><span class="badge badge-concern">${t.concernType}</span></td>
          <td>
            <a href="javascript:void(0)" class="js-open-ticket-details" data-id="${t.id}" style="color:inherit; font-weight:700; text-decoration:none;">${escapeHtml(t.title)}</a>
            <div class="text-xs text-muted">By: ${escapeHtml(t.requesterName)}</div>
            ${t.status === "rejected" ? `<div class="text-xs" style="color:var(--danger); font-weight:600;">⚠️ Returned for rework: "${escapeHtml(t.rejectionReason)}"</div>` : ""}
          </td>
          <td class="text-xs">${escapeHtml(t.branchName)}</td>
          <td class="text-xs">
            ${t.assignedType === "external"
              ? `<span class="badge badge-neutral" title="${escapeHtml(t.externalLaborDetails)}">EXT: ${escapeHtml(t.assignedPersonnelName || "Contractor")}</span>`
              : escapeHtml(t.assignedPersonnelName || "Unassigned")}
          </td>
          <td><span class="sla-badge ${sla.badgeClass}">${sla.label}</span></td>
          <td>${getStatusBadge(t.status)}</td>
          <td style="text-align:right;" onclick="event.stopPropagation();">
            <div style="display:flex; justify-content:flex-end; gap:0.35rem;">
              <button type="button" class="btn btn-outline btn-sm js-open-ticket-details" data-id="${t.id}" title="View details, attachments & history">
                🔍 View
              </button>
              ${(state.currentUser.role === "headadmin" || state.currentUser.role === "superadmin") && t.status === "submitted" ? `
                <button type="button" class="btn btn-primary btn-sm js-open-triage-modal" data-id="${t.id}" title="Triage ticket">
                  Triage
                </button>
              ` : ""}
              ${(state.currentUser.role === "personnel" || state.currentUser.role === "superadmin") && (t.status === "assigned" || t.status === "in_progress" || t.status === "rejected") ? `
                <button type="button" class="btn btn-success btn-sm js-open-done-modal" data-id="${t.id}" title="Mark Done">
                  ${ICONS.check}
                </button>
              ` : ""}
              ${(state.currentUser.role === "requester" || state.currentUser.role === "superadmin") && t.status === "pending_confirmation" ? `
                <button type="button" class="btn btn-success btn-sm js-open-confirm-modal" data-id="${t.id}" title="Confirm Resolution">
                  Verify
                </button>
              ` : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  attachDynamicActionListeners();
}

/* ==========================================================================
   9. REPORTING & ANALYTICS DASHBOARD (Head Admin & SuperAdmin)
   ========================================================================== */
function renderReportingDashboard() {
  const container = document.getElementById("panel-reports");
  if (!container) return;

  // Populate dynamic select options
  const personnelSelect = document.getElementById("rep-filter-personnel");
  if (personnelSelect && personnelSelect.options.length <= 1) {
    const staff = state.users.filter(u => u.role === "personnel");
    personnelSelect.innerHTML = `<option value="all">All Personnel</option>` +
      staff.map(s => `<option value="${escapeHtml(s.displayName)}">${escapeHtml(s.displayName)}</option>`).join("") +
      `<option value="external">External Labor</option>`;
  }

  const branchSelect = document.getElementById("rep-filter-branch");
  if (branchSelect && branchSelect.options.length <= 1) {
    branchSelect.innerHTML = `<option value="all">All Branches</option>` +
      state.stores.map(b => `<option value="${escapeHtml(b.name)}">${escapeHtml(b.name)}</option>`).join("");
  }

  // Filter application
  let list = [...state.tickets];

  const selConcern = document.getElementById("rep-filter-concern")?.value || "all";
  if (selConcern !== "all") list = list.filter(t => t.concernType === selConcern);

  const selPersonnel = document.getElementById("rep-filter-personnel")?.value || "all";
  if (selPersonnel === "external") {
    list = list.filter(t => t.assignedType === "external");
  } else if (selPersonnel !== "all") {
    list = list.filter(t => t.assignedPersonnelName === selPersonnel);
  }

  const selPriority = document.getElementById("rep-filter-priority")?.value || "all";
  if (selPriority !== "all") list = list.filter(t => t.priority === selPriority);

  const selBranch = document.getElementById("rep-filter-branch")?.value || "all";
  if (selBranch !== "all") list = list.filter(t => t.branchName === selBranch);

  // Update KPI counters
  const totalEl = document.getElementById("rep-kpi-total");
  const activeEl = document.getElementById("rep-kpi-active");
  const resolvedEl = document.getElementById("rep-kpi-resolved");
  const breachedEl = document.getElementById("rep-kpi-breached");
  const countBadge = document.getElementById("rep-records-count");

  if (totalEl) totalEl.textContent = list.length;
  if (activeEl) activeEl.textContent = list.filter(t => t.status !== "resolved").length;
  if (resolvedEl) resolvedEl.textContent = list.filter(t => t.status === "resolved").length;
  if (breachedEl) breachedEl.textContent = list.filter(t => getTicketSlaInfo(t).isBreached).length;
  if (countBadge) countBadge.textContent = `${list.length} Records`;

  // Grouping Logic
  const groupBy = document.getElementById("rep-group-by")?.value || "none";
  const groupCard = document.getElementById("rep-grouped-card");
  const groupTbody = document.getElementById("rep-group-tbody");
  const groupTitle = document.getElementById("rep-group-title");
  const groupColName = document.getElementById("rep-group-col-name");

  if (groupBy !== "none" && groupCard && groupTbody) {
    groupCard.classList.remove("hidden");
    const groupKeyMap = {
      concern: { title: "Aggregated by Concern Type / Department", col: "Department / Concern" },
      personnel: { title: "Aggregated by Assigned Personnel", col: "Assigned Staff / Labor" },
      priority: { title: "Aggregated by Priority Level", col: "Priority Tier" },
      branch: { title: "Aggregated by Branch Location", col: "Branch Office" }
    };
    if (groupTitle) groupTitle.textContent = groupKeyMap[groupBy]?.title || "Group Aggregates";
    if (groupColName) groupColName.textContent = groupKeyMap[groupBy]?.col || "Group";

    const groups = {};
    list.forEach(t => {
      let key = "Unassigned";
      if (groupBy === "concern") key = t.concernType || "Other";
      if (groupBy === "personnel") key = t.assignedType === "external" ? "External Labor" : (t.assignedPersonnelName || "Unassigned");
      if (groupBy === "priority") key = (t.priority || "Normal").toUpperCase();
      if (groupBy === "branch") key = t.branchName || "Unknown Branch";

      if (!groups[key]) {
        groups[key] = { total: 0, resolved: 0, pending: 0, inProgress: 0, breached: 0 };
      }
      groups[key].total++;
      if (t.status === "resolved") groups[key].resolved++;
      if (t.status === "pending_confirmation") groups[key].pending++;
      if (t.status === "assigned" || t.status === "in_progress" || t.status === "rejected") groups[key].inProgress++;
      if (getTicketSlaInfo(t).isBreached) groups[key].breached++;
    });

    groupTbody.innerHTML = Object.entries(groups).map(([grpName, st]) => `
      <tr>
        <td><strong>${escapeHtml(grpName)}</strong></td>
        <td class="font-bold">${st.total}</td>
        <td style="color:var(--success); font-weight:700;">${st.resolved}</td>
        <td style="color:var(--purple); font-weight:700;">${st.pending}</td>
        <td style="color:var(--warning); font-weight:700;">${st.inProgress}</td>
        <td style="color:var(--danger); font-weight:700;">${st.breached}</td>
      </tr>
    `).join("");
  } else if (groupCard) {
    groupCard.classList.add("hidden");
  }

  // Render Detailed Records Table
  const tbody = document.getElementById("rep-data-tbody");
  const emptyState = document.getElementById("rep-empty-state");
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = "";
    if (emptyState) {
      emptyState.classList.remove("hidden");
      emptyState.innerHTML = `<p class="text-sm text-muted">No records matching active reporting criteria.</p>`;
    }
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  tbody.innerHTML = list.map(t => {
    const sla = getTicketSlaInfo(t);
    return `
      <tr>
        <td class="mono font-bold">${t.id}</td>
        <td><span class="badge badge-concern">${t.concernType}</span></td>
        <td><strong>${escapeHtml(t.title)}</strong></td>
        <td class="text-xs">${escapeHtml(t.branchName)}</td>
        <td class="text-xs">${escapeHtml(t.requesterName)}</td>
        <td>${getPriorityBadge(t.priority)}</td>
        <td class="text-xs">${escapeHtml(t.assignedPersonnelName || (t.assignedType === "external" ? "External Labor" : "Unassigned"))}</td>
        <td><span class="sla-badge ${sla.badgeClass}">${sla.label}</span></td>
        <td>${getStatusBadge(t.status)}</td>
      </tr>
    `;
  }).join("");
}

/**
 * Generates and downloads a clean, formatted CSV report file.
 */
function exportReportsToCsv() {
  const headers = [
    "Ticket ID",
    "Concern Type",
    "Title",
    "Description",
    "Branch Location",
    "Requester Name",
    "Requester Email",
    "Contact Phone",
    "Priority",
    "Status",
    "Assigned Category",
    "Assigned Personnel",
    "Reported At",
    "Due Date",
    "Elapsed Hours",
    "SLA Status",
    "Resolved At"
  ];

  const rows = state.tickets.map(t => {
    const sla = getTicketSlaInfo(t);
    return [
      t.id,
      `"${(t.concernType || "").replace(/"/g, '""')}"`,
      `"${(t.title || "").replace(/"/g, '""')}"`,
      `"${(t.description || "").replace(/"/g, '""')}"`,
      `"${(t.branchName || "").replace(/"/g, '""')}"`,
      `"${(t.requesterName || "").replace(/"/g, '""')}"`,
      `"${(t.requesterEmail || "")}"`,
      `"${(t.contactNumber || "")}"`,
      t.priority || "medium",
      t.status || "submitted",
      t.assignedType || "internal",
      `"${(t.assignedPersonnelName || "").replace(/"/g, '""')}"`,
      t.reportedAt || "",
      t.requestedDueDate || "",
      sla.elapsedHours.toFixed(1),
      sla.tier.toUpperCase(),
      t.resolvedAt || ""
    ];
  });

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Helpdesk_Daily_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Daily report exported to CSV successfully", "success");
}

/* ==========================================================================
   10. MANAGE BRANCHES & USERS DIRECTORY
   ========================================================================== */
function renderStoresSection() {
  const tbody = document.getElementById("stores-table-tbody");
  const countBadge = document.getElementById("stores-count-badge");
  if (!tbody) return;

  if (countBadge) countBadge.textContent = `${state.stores.length} Branches`;

  tbody.innerHTML = state.stores.map(s => {
    const activeBranchTickets = state.tickets.filter(t => t.branchId === s.id && t.status !== "resolved").length;
    return `
      <tr>
        <td>
          <strong>${escapeHtml(s.name)}</strong>
          <div class="mono text-xs text-muted">CODE: ${s.code || "BR"}</div>
        </td>
        <td>${escapeHtml(s.address)}</td>
        <td class="mono">${s.phone}</td>
        <td><span class="badge badge-success">&#10003; Operational</span></td>
        <td class="font-bold">${activeBranchTickets} Active</td>
        <td style="text-align:right;">
          <div style="display:flex; justify-content:flex-end; gap:0.35rem;">
            <button type="button" class="btn btn-outline btn-sm js-edit-store" data-id="${s.id}" title="Edit Branch">
              ${ICONS.edit}
            </button>
            <button type="button" class="btn btn-outline btn-sm js-delete-store" data-id="${s.id}" title="Delete Branch" style="color:var(--danger); border-color:var(--danger-border);">
              ${ICONS.delete}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".js-edit-store").forEach(btn => {
    btn.addEventListener("click", () => {
      const s = state.stores.find(x => x.id === btn.dataset.id);
      if (!s) return;
      document.getElementById("edit-store-id").value = s.id;
      document.getElementById("edit-store-name").value = s.name;
      document.getElementById("edit-store-address").value = s.address;
      document.getElementById("edit-store-phone").value = s.phone;
      document.getElementById("dialog-edit-store")?.showModal();
    });
  });

  tbody.querySelectorAll(".js-delete-store").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this branch?")) {
        state.stores = state.stores.filter(x => x.id !== btn.dataset.id);
        saveLocalState();
        showToast("Branch deleted", "info");
        renderStoresSection();
      }
    });
  });
}

function renderUsersSection() {
  const tbody = document.getElementById("users-table-tbody");
  const countBadge = document.getElementById("users-count-badge");
  if (!tbody) return;

  let list = [...state.users];

  if (state.userRoleFilter !== "all") {
    list = list.filter(u => u.role === state.userRoleFilter);
  }

  const searchInput = document.getElementById("search-users-input");
  if (searchInput && searchInput.value.trim()) {
    const q = searchInput.value.trim().toLowerCase();
    list = list.filter(u =>
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q)) ||
      (u.branchName && u.branchName.toLowerCase().includes(q))
    );
  }

  if (countBadge) countBadge.textContent = `${list.length} Users`;

  // Update counters
  const cntTotal = document.getElementById("kpi-users-total");
  const cntStores = document.getElementById("kpi-users-stores");
  const cntFixers = document.getElementById("kpi-users-fixers");
  const cntAdmins = document.getElementById("kpi-users-admins");
  if (cntTotal) cntTotal.textContent = state.users.length;
  if (cntStores) cntStores.textContent = state.users.filter(u => u.role === "requester").length;
  if (cntFixers) cntFixers.textContent = state.users.filter(u => u.role === "personnel").length;
  if (cntAdmins) cntAdmins.textContent = state.users.filter(u => u.role === "headadmin" || u.role === "superadmin").length;

  const pillAll = document.getElementById("pill-cnt-all");
  const pillStore = document.getElementById("pill-cnt-store");
  const pillFixer = document.getElementById("pill-cnt-fixer");
  const pillHead = document.getElementById("pill-cnt-headadmin");
  const pillAdmin = document.getElementById("pill-cnt-admin");
  if (pillAll) pillAll.textContent = state.users.length;
  if (pillStore) pillStore.textContent = state.users.filter(u => u.role === "requester").length;
  if (pillFixer) pillFixer.textContent = state.users.filter(u => u.role === "personnel").length;
  if (pillHead) pillHead.textContent = state.users.filter(u => u.role === "headadmin").length;
  if (pillAdmin) pillAdmin.textContent = state.users.filter(u => u.role === "superadmin").length;

  tbody.innerHTML = list.map(u => {
    const roleBadges = {
      requester: `<span class="badge badge-primary">REQUESTER</span>`,
      personnel: `<span class="badge badge-success">PERSONNEL</span>`,
      headadmin: `<span class="badge badge-warning">HEAD ADMIN</span>`,
      superadmin: `<span class="badge badge-purple">SUPERADMIN</span>`
    };
    return `
      <tr>
        <td>${roleBadges[u.role] || u.role}</td>
        <td>
          <strong>${escapeHtml(u.displayName)}</strong>
          <div class="mono text-xs text-muted">@${u.username} &bull; ${escapeHtml(u.email || "no-email")}</div>
        </td>
        <td>
          <div>${escapeHtml(u.branchName || "All Branches")}</div>
          <div class="text-xs text-muted">${escapeHtml(u.department || "Operations")}</div>
        </td>
        <td class="mono">${u.phone || "—"}</td>
        <td style="text-align:right;">
          <div style="display:flex; justify-content:flex-end; gap:0.35rem;">
            <button type="button" class="btn btn-outline btn-sm js-login-as-user" data-username="${u.username}" title="1-Click Login">
              Sign In
            </button>
            <button type="button" class="btn btn-outline btn-sm js-delete-user" data-id="${u.id}" title="Delete" style="color:var(--danger); border-color:var(--danger-border);">
              ${ICONS.delete}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".js-login-as-user").forEach(b => {
    b.addEventListener("click", () => {
      const u = state.users.find(x => x.username === b.dataset.username);
      if (u) {
        state.currentUser = u;
        saveLocalState();
        showToast(`Signed in as ${u.displayName}`, "success");
        renderAllViews();
      }
    });
  });

  tbody.querySelectorAll(".js-delete-user").forEach(b => {
    b.addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this user?")) {
        state.users = state.users.filter(x => x.id !== b.dataset.id);
        saveLocalState();
        showToast("User deleted", "info");
        renderUsersSection();
      }
    });
  });
}

/* ==========================================================================
   11. MODAL DIALOG CONTROLS & LIFECYCLE ACTIONS
   ========================================================================== */
function setSubmitModalStep(step) {
  const step1 = document.getElementById("submit-step-photo");
  const step2 = document.getElementById("submit-step-details");
  const title = document.getElementById("submit-ticket-title");

  if (step === 1) {
    step1?.classList.remove("hidden");
    step2?.classList.add("hidden");
    if (title) title.textContent = "Report Issue • Step 1: Take Photo";
  } else {
    step1?.classList.add("hidden");
    step2?.classList.remove("hidden");
    if (title) title.textContent = "Report Issue • Step 2: Details";
  }
}

function openSubmitTicketModal() {
  const dialog = document.getElementById("dialog-submit-ticket");
  if (!dialog) return;

  setSubmitModalStep(1);

  const container = document.getElementById("requester-field-container");
  const emailInput = document.getElementById("ticket-contact-email");
  const phoneInput = document.getElementById("ticket-contact-phone");
  const branchSelect = document.getElementById("ticket-branch-select");
  const dueInput = document.getElementById("ticket-due-date");

  // Populate branches dropdown
  if (branchSelect) {
    branchSelect.innerHTML = state.stores.map(s => `
      <option value="${s.id}" ${state.currentUser.branchId === s.id ? "selected" : ""}>
        ${escapeHtml(s.name)}
      </option>
    `).join("");
  }

  // AUTO-POPULATION LOGIC:
  // If logged in user is a Requester (Employee):
  // All profile & branch details are 100% automated — completely hidden so form is fast and short!
  const adminSection = document.getElementById("ticket-admin-employee-selector");
  const autoBadge = document.getElementById("requester-auto-profile-badge");
  const badgeName = document.getElementById("badge-requester-name");
  const badgeBranch = document.getElementById("badge-requester-branch");

  if (state.currentUser.role === "requester") {
    // 1. Show compact 1-line badge at the top
    if (autoBadge) {
      autoBadge.classList.remove("hidden");
      if (badgeName) badgeName.textContent = state.currentUser.displayName;
      if (badgeBranch) badgeBranch.textContent = state.currentUser.branchName || "Main Branch";
    }

    // 2. Hide the entire long employee input block
    if (adminSection) {
      adminSection.classList.add("hidden");
    }

    // 3. Populate all values behind the scenes and remove HTML5 required checks
    if (container) {
      container.innerHTML = `
        <input type="text" id="ticket-requester-name" name="requester_name" class="form-input"
          value="${escapeHtml(state.currentUser.displayName)}" readonly />
      `;
    }
    if (emailInput) {
      emailInput.value = state.currentUser.email || `${state.currentUser.username}@successo.ph`;
      emailInput.removeAttribute("required");
    }
    if (phoneInput) {
      phoneInput.value = state.currentUser.phone || "+639170000000";
      phoneInput.removeAttribute("required");
    }
    if (branchSelect && state.currentUser.branchId) {
      branchSelect.value = state.currentUser.branchId;
      branchSelect.removeAttribute("required");
    }
    if (dueInput) {
      dueInput.value = todayDateStr;
      dueInput.removeAttribute("required");
    }
  }
  // If Head Admin / Superadmin is creating on behalf of an employee:
  else {
    if (autoBadge) {
      autoBadge.classList.add("hidden");
    }
    if (adminSection) {
      adminSection.classList.remove("hidden");
    }

    // List all employees in DB
    const employeeList = state.users.filter(u => u.role === "requester");
    const activeList = employeeList.length > 0 ? employeeList : state.users;

    if (container) {
      container.innerHTML = `
        <select id="ticket-requester-select" name="requester_name" class="form-select" required>
          <option value="" disabled selected>Select employee from database...</option>
          ${activeList.map(e => `
            <option value="${escapeHtml(e.displayName)}" data-phone="${e.phone || ""}" data-email="${e.email || ""}" data-branch="${e.branchId || ""}">
              ${escapeHtml(e.displayName)} — ${escapeHtml(e.department || e.role)} (${escapeHtml(e.branchName || "Main")})
            </option>
          `).join("")}
        </select>
      `;

      const reqSelect = document.getElementById("ticket-requester-select");
      reqSelect?.addEventListener("change", (e) => {
        const opt = reqSelect.options[reqSelect.selectedIndex];
        if (opt) {
          if (emailInput) emailInput.value = opt.dataset.email || "";
          if (phoneInput) phoneInput.value = opt.dataset.phone || "";
          if (branchSelect && opt.dataset.branch) branchSelect.value = opt.dataset.branch;
        }
      });
    }

    if (emailInput) {
      emailInput.value = "";
      emailInput.setAttribute("required", "required");
    }
    if (phoneInput) {
      phoneInput.value = "";
      phoneInput.setAttribute("required", "required");
    }
    if (branchSelect) {
      branchSelect.setAttribute("required", "required");
    }
    if (dueInput) {
      dueInput.value = todayDateStr;
      dueInput.setAttribute("required", "required");
    }
  }

  // Set default due date to tomorrow or today
  if (dueInput && !dueInput.value) {
    dueInput.value = todayDateStr;
  }

  // Reset any pending photo
  state.pendingReportPhotoBlob = null;
  state.pendingReportPhotoDataUrl = "";
  document.getElementById("report-photo-preview-wrap")?.classList.add("hidden");
  const hint = document.getElementById("report-upload-hint");
  if (hint) hint.textContent = "Photos or documents are stored securely in Telegram bot and linked in Firebase.";

  dialog.showModal();
}

function openTriageModal(ticketId) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const dialog = document.getElementById("dialog-triage-ticket");
  document.getElementById("triage-ticket-id").value = ticket.id;
  document.getElementById("triage-modal-subtitle").textContent = `${ticket.id} • ${ticket.branchName}`;

  const sla = getTicketSlaInfo(ticket);
  const infoBox = document.getElementById("triage-info-box");
  if (infoBox) {
    infoBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
        <div><strong>Title:</strong> ${escapeHtml(ticket.title)}</div>
        <span class="sla-badge ${sla.badgeClass}">${sla.label}</span>
      </div>
      <div><strong>Concern Type:</strong> ${escapeHtml(ticket.concernType)}</div>
      <div><strong>Requester:</strong> ${escapeHtml(ticket.requesterName)} (${ticket.contactNumber} &bull; ${escapeHtml(ticket.requesterEmail || "—")})</div>
      <div><strong>Posted:</strong> ${formatDateStr(ticket.reportedAt)} (${sla.elapsedHours.toFixed(1)} hours ago)</div>
    `;
  }

  // Populate Personnel Select
  const staffSelect = document.getElementById("triage-personnel-select");
  if (staffSelect) {
    const staff = state.users.filter(u => u.role === "personnel");
    staffSelect.innerHTML = staff.map(s => `
      <option value="${s.id}">${escapeHtml(s.displayName)} (${escapeHtml(s.department || "Staff")})</option>
    `).join("");
  }

  dialog?.showModal();
}

function openDoneModal(ticketId) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const dialog = document.getElementById("dialog-personnel-done");
  document.getElementById("done-ticket-id").value = ticket.id;
  document.getElementById("done-modal-subtitle").textContent = `${ticket.id} • ${ticket.title}`;

  // If this task was rejected, display the rework alert feedback!
  const reworkAlert = document.getElementById("done-rework-alert");
  if (reworkAlert) {
    if (ticket.status === "rejected" && ticket.rejectionReason) {
      reworkAlert.classList.remove("hidden");
      reworkAlert.innerHTML = `
        <div style="font-weight:700; margin-bottom:0.25rem;">⚠️ Requester Returned This Task For Rework:</div>
        <div style="font-style:italic;">"${escapeHtml(ticket.rejectionReason)}"</div>
        <div class="text-xs" style="margin-top:0.35rem; opacity:0.85;">Please address the issue, upload new proof, and mark done.</div>
      `;
    } else {
      reworkAlert.classList.add("hidden");
    }
  }

  // Reset proof upload state
  state.pendingFixPhotoBlob = null;
  state.pendingFixPhotoDataUrl = "";
  document.getElementById("fix-photo-preview-wrap")?.classList.add("hidden");
  const hint = document.getElementById("fix-upload-hint");
  if (hint) hint.textContent = "Take a live photo of the repaired equipment or upload proof from files.";

  dialog?.showModal();
}

function openConfirmModal(ticketId) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const dialog = document.getElementById("dialog-requester-confirm");
  document.getElementById("confirm-modal-subtitle").textContent = `${ticket.id} • ${ticket.title}`;

  // Render before & after images side by side
  const box = document.getElementById("confirm-comparison-box");
  const issuePhoto = ticket.attachments?.[0]?.url || "";
  const proofPhoto = ticket.doneProofUrl || "";

  if (box) {
    box.innerHTML = `
      <div class="report-image-col">
        <div class="report-image-col-header">
          <span>1. Reported Issue Photo</span>
          <span class="badge badge-danger">BEFORE</span>
        </div>
        <div class="report-image-box">
          ${issuePhoto ? `<img src="${issuePhoto}" alt="Issue photo" class="js-lightbox-trigger" data-src="${issuePhoto}" style="cursor:pointer;" />` : `<div style="padding:2rem; text-align:center;">No photo</div>`}
        </div>
      </div>
      <div class="report-image-col">
        <div class="report-image-col-header">
          <span>2. Personnel Repair Proof</span>
          <span class="badge badge-success">AFTER</span>
        </div>
        <div class="report-image-box">
          ${proofPhoto ? `<img src="${proofPhoto}" alt="Proof photo" class="js-lightbox-trigger" data-src="${proofPhoto}" style="cursor:pointer;" />` : `<div style="padding:2rem; text-align:center;">No proof photo</div>`}
        </div>
      </div>
    `;
  }

  const notesBox = document.getElementById("confirm-notes-box");
  if (notesBox) {
    notesBox.innerHTML = `
      <div><strong>Personnel Resolution Notes:</strong></div>
      <p style="margin:0.25rem 0 0 0;">${escapeHtml(ticket.doneNotes || "Completed repair work.")}</p>
      <div class="text-xs text-muted mono" style="margin-top:0.4rem;">Completed at: ${formatDateStr(ticket.doneAt)}</div>
    `;
  }

  // Wire buttons
  const btnConfirm = document.getElementById("btn-confirm-resolution");
  const btnToggleReject = document.getElementById("btn-toggle-reject");
  const rejectGroup = document.getElementById("rejection-reason-group");
  const rejectInput = document.getElementById("rejection-reason-input");

  rejectGroup.style.display = "none";
  btnToggleReject.textContent = "Reject (Needs Rework)";
  if (rejectInput) rejectInput.value = "";

  btnConfirm.onclick = async () => {
    ticket.status = "resolved";
    ticket.resolvedAt = new Date().toISOString();
    await persistTicket(ticket);
    dialog.close();
    showToast("Resolution confirmed! Ticket officially closed.", "success");
    renderAllViews();
  };

  btnToggleReject.onclick = async () => {
    if (rejectGroup.style.display === "none") {
      rejectGroup.style.display = "block";
      btnToggleReject.textContent = "Confirm Rejection & Send Back";
    } else {
      const reason = rejectInput.value.trim();
      if (!reason) {
        showToast("Please enter a reason explaining what is still broken.", "danger");
        return;
      }
      ticket.status = "rejected";
      ticket.rejectionReason = reason;
      ticket.rejectedAt = new Date().toISOString();
      await persistTicket(ticket);
      dialog.close();
      showToast(`Ticket ${ticket.id} returned to assigned personnel for rework.`, "info");
      renderAllViews();
    }
  };

  dialog?.showModal();
}

/**
 * Universally accessible Ticket Details Modal for ALL ROLES (Requester, Personnel, Head Admin, Superadmin)
 */
function openTicketDetailsModal(ticketId) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const dialog = document.getElementById("dialog-ticket-details");
  if (!dialog) return;

  document.getElementById("ticket-modal-id").textContent = ticket.id;
  document.getElementById("ticket-modal-subtitle").textContent = `${ticket.branchName} • Target Due: ${ticket.requestedDueDate || "ASAP"}`;

  // Update badges cleanly without destroying their IDs
  const prioBadge = document.getElementById("ticket-modal-prio-badge");
  if (prioBadge) {
    prioBadge.className = `badge ${getPriorityBadgeClass(ticket.priority)}`;
    prioBadge.textContent = (ticket.priority || "MEDIUM").toUpperCase();
  }

  const sla = getTicketSlaInfo(ticket);
  const slaBadge = document.getElementById("ticket-modal-sla-badge");
  if (slaBadge) {
    slaBadge.className = `sla-badge ${sla.badgeClass}`;
    slaBadge.textContent = sla.label;
  }

  const statusBadge = document.getElementById("ticket-modal-status-badge");
  if (statusBadge) {
    statusBadge.className = `badge ${getStatusBadgeClass(ticket.status)}`;
    statusBadge.textContent = getStatusBadgeText(ticket.status);
  }

  const modalBody = document.getElementById("ticket-modal-body");
  const issuePhoto = ticket.attachments?.[0]?.url || "";
  const proofPhoto = ticket.doneProofUrl || "";

  if (modalBody) {
    modalBody.innerHTML = `
      <div style="background:var(--bg-muted); padding:1rem; border-radius:var(--radius-md);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
          <div style="flex:1; min-width:240px;">
            <span class="badge badge-concern" style="margin-bottom:0.35rem;">${ticket.concernType}</span>
            <h4 style="font-size:1.15rem; font-weight:800; margin:0 0 0.4rem 0;">${escapeHtml(ticket.title)}</h4>
            <p style="margin:0; font-size:0.875rem; color:var(--text-secondary); white-space:pre-wrap;">${escapeHtml(ticket.description)}</p>
          </div>
          <div style="text-align:right; min-width:180px; font-size:0.8125rem;">
            <div class="text-xs text-muted">Submitted By</div>
            <strong style="font-size:0.95rem;">${escapeHtml(ticket.requesterName)}</strong>
            <div class="mono">${ticket.contactNumber || "—"}</div>
            <div class="mono text-muted text-xs">${escapeHtml(ticket.requesterEmail || "—")}</div>
            <div class="text-muted" style="margin-top:0.25rem;">${escapeHtml(ticket.branchName)}</div>
          </div>
        </div>
      </div>

      <!-- Attachments Section (Visible to Requester, Personnel, Admins) -->
      <div>
        <h4 style="font-size:0.85rem; font-weight:700; text-transform:uppercase; margin-bottom:0.5rem; color:var(--text-secondary);">
          Visual Evidence &amp; Attachments
        </h4>
        <div class="report-images-row ${proofPhoto ? "has-two" : ""}">
          <div class="report-image-col">
            <div class="report-image-col-header">
              <span>Reported Issue Attachment</span>
              <span class="badge badge-neutral">INITIAL ISSUE</span>
            </div>
            <div class="report-image-box">
              ${issuePhoto ? `<img src="${issuePhoto}" alt="Issue photo" class="js-lightbox-trigger" data-src="${issuePhoto}" style="cursor:pointer;" title="Tap to expand in full view" />` : `<div style="padding:2.5rem; text-align:center; color:var(--text-muted);">No image attached</div>`}
            </div>
          </div>
          ${proofPhoto ? `
            <div class="report-image-col">
              <div class="report-image-col-header">
                <span>Personnel Resolution Proof</span>
                <span class="badge badge-success">COMPLETED FIX</span>
              </div>
              <div class="report-image-box">
                <img src="${proofPhoto}" alt="Proof photo" class="js-lightbox-trigger" data-src="${proofPhoto}" style="cursor:pointer;" title="Tap to expand in full view" />
              </div>
            </div>
          ` : ""}
        </div>
      </div>

      <!-- Personnel Completion Notes (If Available) -->
      ${ticket.doneNotes ? `
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:var(--radius-md); padding:0.875rem;">
          <div style="font-weight:700; color:#166534; margin-bottom:0.25rem;">Personnel Work Accomplished Notes:</div>
          <p style="margin:0; font-size:0.875rem; color:#14532d;">${escapeHtml(ticket.doneNotes)}</p>
          <div class="text-xs mono" style="margin-top:0.35rem; color:#166534;">Completed at: ${formatDateStr(ticket.doneAt)}</div>
        </div>
      ` : ""}

      <!-- Rejection Feedback (If Rejected) -->
      ${ticket.rejectionReason ? `
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:var(--radius-md); padding:0.875rem;">
          <div style="font-weight:700; color:#991b1b; margin-bottom:0.25rem;">⚠️ Requester Rejection Feedback (Rework Required):</div>
          <p style="margin:0; font-size:0.875rem; color:#7f1d1d;">"${escapeHtml(ticket.rejectionReason)}"</p>
          <div class="text-xs mono" style="margin-top:0.35rem; color:#991b1b;">Returned on: ${formatDateStr(ticket.rejectedAt || ticket.triagedAt)}</div>
        </div>
      ` : ""}

      <!-- Full Lifecycle Timeline & History -->
      <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1rem;">
        <h4 style="font-size:0.85rem; font-weight:700; text-transform:uppercase; margin-bottom:0.75rem; color:var(--text-secondary);">End-to-End Lifecycle History</h4>
        <div style="display:flex; flex-direction:column; gap:0.65rem; font-size:0.8125rem;">
          <div style="display:flex; align-items:flex-start; gap:0.5rem;">
            <span style="color:var(--success); font-weight:700;">&#10003; 1. Submitted:</span>
            <span>By <strong>${escapeHtml(ticket.requesterName)}</strong> on ${formatDateStr(ticket.reportedAt)}</span>
          </div>
          <div style="display:flex; align-items:flex-start; gap:0.5rem;">
            <span style="${ticket.triagedAt ? "color:var(--success); font-weight:700;" : "color:var(--text-muted);"}">${ticket.triagedAt ? "&#10003;" : "&bull;"} 2. Triaged &amp; Assigned:</span>
            <span>${ticket.triagedAt ? `Priority set to <strong>${ticket.priority.toUpperCase()}</strong> &bull; Assigned to <strong>${escapeHtml(ticket.assignedPersonnelName || "External Contractor")}</strong> on ${formatDateStr(ticket.triagedAt)}` : "Awaiting triage by Head Admin"}</span>
          </div>
          <div style="display:flex; align-items:flex-start; gap:0.5rem;">
            <span style="${ticket.doneAt ? "color:var(--success); font-weight:700;" : "color:var(--text-muted);"}">${ticket.doneAt ? "&#10003;" : "&bull;"} 3. Personnel Execution:</span>
            <span>${ticket.doneAt ? `Work finished on ${formatDateStr(ticket.doneAt)} with proof uploaded` : (ticket.status === "rejected" ? `<strong style="color:var(--danger);">Rework in progress by ${escapeHtml(ticket.assignedPersonnelName || "Personnel")}</strong>` : "Personnel currently working on resolution")}</span>
          </div>
          <div style="display:flex; align-items:flex-start; gap:0.5rem;">
            <span style="${ticket.resolvedAt ? "color:var(--success); font-weight:700;" : (ticket.status === "rejected" ? "color:var(--danger); font-weight:700;" : "color:var(--text-muted);")}">${ticket.resolvedAt ? "&#10003;" : (ticket.status === "rejected" ? "⚠️" : "&bull;")} 4. Final Requester Verification:</span>
            <span>${ticket.resolvedAt ? `Officially confirmed and closed on ${formatDateStr(ticket.resolvedAt)}` : (ticket.status === "rejected" ? `Rejected by requester for rework: "${escapeHtml(ticket.rejectionReason)}"` : "Pending final verification by requester")}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Footer context actions based on role
  const footer = document.getElementById("ticket-modal-footer");
  if (footer) {
    let actionButtons = "";

    // If Requester and ticket is pending confirmation:
    if ((state.currentUser.role === "requester" || state.currentUser.role === "superadmin") && ticket.status === "pending_confirmation") {
      actionButtons = `
        <button type="button" class="btn btn-success js-modal-action-confirm" data-id="${ticket.id}">
          &#10003; Confirm Resolution / Close Ticket
        </button>
      `;
    }
    // If Personnel and ticket is active/rejected:
    else if ((state.currentUser.role === "personnel" || state.currentUser.role === "superadmin") && (ticket.status === "assigned" || ticket.status === "in_progress" || ticket.status === "rejected")) {
      actionButtons = `
        <button type="button" class="btn btn-success js-modal-action-done" data-id="${ticket.id}">
          ${ICONS.check} Mark as Done / Upload Proof
        </button>
      `;
    }
    // If Head Admin and ticket is submitted:
    else if ((state.currentUser.role === "headadmin" || state.currentUser.role === "superadmin") && ticket.status === "submitted") {
      actionButtons = `
        <button type="button" class="btn btn-primary js-modal-action-triage" data-id="${ticket.id}">
          Triage &amp; Assign Ticket
        </button>
      `;
    }

    footer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:0.5rem; flex-wrap:wrap;">
        <button type="button" class="btn btn-outline js-close-dialog" data-dialog="dialog-ticket-details">Close Details</button>
        <div>${actionButtons}</div>
      </div>
    `;

    footer.querySelector(".js-modal-action-confirm")?.addEventListener("click", () => {
      dialog.close();
      openConfirmModal(ticket.id);
    });

    footer.querySelector(".js-modal-action-done")?.addEventListener("click", () => {
      dialog.close();
      openDoneModal(ticket.id);
    });

    footer.querySelector(".js-modal-action-triage")?.addEventListener("click", () => {
      dialog.close();
      openTriageModal(ticket.id);
    });

    footer.querySelector(".js-close-dialog")?.addEventListener("click", () => {
      dialog.close();
    });
  }

  // Lightbox trigger binding
  modalBody?.querySelectorAll(".js-lightbox-trigger").forEach(img => {
    img.addEventListener("click", () => {
      const lb = document.getElementById("dialog-lightbox");
      const lbImg = document.getElementById("lightbox-img");
      if (lb && lbImg) {
        lbImg.src = img.dataset.src;
        lb.showModal();
      }
    });
  });

  dialog.showModal();
}

function attachDynamicActionListeners() {
  document.querySelectorAll(".js-open-ticket-details").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openTicketDetailsModal(btn.dataset.id);
    };
  });
  document.querySelectorAll(".js-open-triage-modal").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openTriageModal(btn.dataset.id);
    };
  });
  document.querySelectorAll(".js-open-done-modal").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openDoneModal(btn.dataset.id);
    };
  });
  document.querySelectorAll(".js-open-confirm-modal").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openConfirmModal(btn.dataset.id);
    };
  });
  document.querySelectorAll(".js-trigger-submit-modal").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openSubmitTicketModal();
    };
  });
}

/* ==========================================================================
   12. FORM HANDLERS & EVENT BINDINGS
   ========================================================================== */
function setupEventHandlers() {
  // Login Form
  const loginForm = document.getElementById("login-form");
  loginForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const user = document.getElementById("login-username")?.value.trim();
    const pass = document.getElementById("login-password")?.value.trim();
    handleLogin(user, pass);
  });

  // Toggle Password
  const btnTogglePw = document.getElementById("btn-toggle-login-pw");
  btnTogglePw?.addEventListener("click", () => {
    const inp = document.getElementById("login-password");
    if (!inp) return;
    const isPw = inp.type === "password";
    inp.type = isPw ? "text" : "password";
    btnTogglePw.textContent = isPw ? "Hide" : "Show";
  });

  // Logout
  document.getElementById("btn-logout")?.addEventListener("click", () => handleLogout());

  // Submit Ticket Form
  const submitForm = document.getElementById("submit-ticket-form");
  submitForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const concern = document.getElementById("ticket-concern-type")?.value;
    const title = document.getElementById("ticket-title")?.value.trim();
    const description = document.getElementById("ticket-description")?.value.trim();

    // Support both locked input and select for Requester Name, with automatic profile fallback
    const requesterName = document.getElementById("ticket-requester-name")?.value.trim() ||
      document.getElementById("ticket-requester-select")?.value.trim() ||
      state.currentUser?.displayName || "Store Requester";
    const contactEmail = document.getElementById("ticket-contact-email")?.value.trim() || state.currentUser?.email || "store@successo.ph";
    const contactPhone = document.getElementById("ticket-contact-phone")?.value.trim() || state.currentUser?.phone || "+639170000000";
    const branchId = document.getElementById("ticket-branch-select")?.value || state.currentUser?.branchId || state.stores[0]?.id;
    const dueDate = document.getElementById("ticket-due-date")?.value || todayDateStr;

    if (!concern || !title || !description) {
      showToast("Please select a concern type, and provide an issue title and description.", "danger");
      return;
    }

    const branch = state.stores.find(b => b.id === branchId);
    const btnSave = document.getElementById("btn-submit-ticket-save");
    if (btnSave) { btnSave.disabled = true; btnSave.textContent = "Uploading to Telegram & Saving..."; }

    // Upload attachment via Telegram Bot API or local data URL
    let attachmentObj = {
      url: createFlatSvgPlaceholder("#b91c1c", "ISSUE ATTACHMENT", title),
      fileId: `tg_photo_${Date.now()}`,
      fileName: "issue_attachment.jpg"
    };

    if (state.pendingReportPhotoBlob && state.pendingReportPhotoDataUrl) {
      const tgRes = await uploadPhotoViaTelegram(state.pendingReportPhotoBlob, state.pendingReportPhotoDataUrl, `${title} - ${branch?.name}`);
      attachmentObj = {
        url: tgRes.url,
        fileId: tgRes.fileId,
        fileName: state.pendingReportPhotoBlob.name || "attachment.jpg"
      };
    }

    const newTicket = {
      id: `TICK-${1000 + state.tickets.length + 1}`,
      concernType: concern,
      title: title,
      description: description,
      attachments: [attachmentObj],
      requesterId: state.currentUser.id || "user_req",
      requesterName: requesterName,
      requesterEmail: contactEmail,
      contactNumber: contactPhone,
      branchId: branchId,
      branchName: branch?.name || "Main Branch",
      requestedDueDate: dueDate,
      priority: "medium", // Default until Head Admin triages
      status: "submitted",
      assignedType: "",
      assignedPersonnelId: "",
      assignedPersonnelName: "",
      externalLaborDetails: "",
      reportedAt: new Date().toISOString(),
      triagedAt: "",
      triagedBy: "",
      doneAt: "",
      doneNotes: "",
      doneProofUrl: "",
      resolvedAt: "",
      rejectionReason: ""
    };

    await persistTicket(newTicket);

    if (btnSave) { btnSave.disabled = false; btnSave.textContent = "Submit Ticket → Route to Head Admin"; }
    document.getElementById("dialog-submit-ticket")?.close();
    submitForm.reset();
    state.pendingReportPhotoBlob = null;
    state.pendingReportPhotoDataUrl = "";
    document.getElementById("report-photo-preview-wrap")?.classList.add("hidden");

    showToast(`Ticket ${newTicket.id} submitted! Routed to Head Admin for triage.`, "success");
    renderAllViews();
  });

  // Triage Ticket Form
  const triageForm = document.getElementById("triage-ticket-form");
  triageForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ticketId = document.getElementById("triage-ticket-id").value;
    const ticket = state.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const prio = triageForm.querySelector("input[name='priority']:checked")?.value || "medium";
    const assignType = triageForm.querySelector("input[name='assignment_type']:checked")?.value || "internal";

    ticket.priority = prio;
    ticket.assignedType = assignType;
    ticket.triagedAt = new Date().toISOString();
    ticket.triagedBy = state.currentUser.username;
    ticket.status = "assigned";

    if (assignType === "internal") {
      const staffId = document.getElementById("triage-personnel-select").value;
      const staffUser = state.users.find(u => u.id === staffId);
      ticket.assignedPersonnelId = staffId;
      ticket.assignedPersonnelName = staffUser?.displayName || "Internal Staff";
      ticket.externalLaborDetails = "";
    } else {
      const extDetails = document.getElementById("triage-external-details").value.trim();
      ticket.assignedPersonnelId = "";
      ticket.assignedPersonnelName = extDetails.split("\n")[0] || "External Contractor";
      ticket.externalLaborDetails = extDetails;
    }

    await persistTicket(ticket);
    document.getElementById("dialog-triage-ticket")?.close();
    showToast(`Ticket ${ticket.id} triaged and dispatched!`, "success");
    renderAllViews();
  });

  // Triage Assignment Type Switch (Internal vs External)
  document.getElementById("assign-type-internal")?.addEventListener("change", () => {
    document.getElementById("triage-internal-group")?.classList.remove("hidden");
    document.getElementById("triage-external-group")?.classList.add("hidden");
  });
  document.getElementById("assign-type-external")?.addEventListener("change", () => {
    document.getElementById("triage-internal-group")?.classList.add("hidden");
    document.getElementById("triage-external-group")?.classList.remove("hidden");
  });

  // Personnel Done Form
  const doneForm = document.getElementById("personnel-done-form");
  doneForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ticketId = document.getElementById("done-ticket-id").value;
    const ticket = state.tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const notes = document.getElementById("done-notes-input").value.trim();
    if (!notes) {
      showToast("Please provide resolution notes describing the work done.", "danger");
      return;
    }

    let proofUrl = ticket.doneProofUrl || createFlatSvgPlaceholder("#16a34a", "COMPLETED REPAIR", ticket.title);
    if (state.pendingFixPhotoBlob && state.pendingFixPhotoDataUrl) {
      const tgRes = await uploadPhotoViaTelegram(state.pendingFixPhotoBlob, state.pendingFixPhotoDataUrl, `Proof: ${ticket.title}`);
      proofUrl = tgRes.url;
    }

    ticket.status = "pending_confirmation";
    ticket.doneAt = new Date().toISOString();
    ticket.doneNotes = notes;
    ticket.doneProofUrl = proofUrl;

    await persistTicket(ticket);
    document.getElementById("dialog-personnel-done")?.close();
    doneForm.reset();
    state.pendingFixPhotoBlob = null;
    state.pendingFixPhotoDataUrl = "";
    document.getElementById("fix-photo-preview-wrap")?.classList.add("hidden");

    showToast(`Task ${ticket.id} marked completed! Awaiting Requester confirmation.`, "success");
    renderAllViews();
  });

  // Reporting Filters & Export
  ["rep-filter-concern", "rep-filter-personnel", "rep-filter-priority", "rep-filter-branch", "rep-group-by"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => renderReportingDashboard());
  });

  document.getElementById("btn-export-csv")?.addEventListener("click", () => exportReportsToCsv());
  document.getElementById("btn-print-report")?.addEventListener("click", () => window.print());

  // Ticket Search & Filter Bar
  document.getElementById("search-tickets")?.addEventListener("input", () => renderTicketsSection());
  document.getElementById("filter-concern-type")?.addEventListener("change", () => renderTicketsSection());
  document.getElementById("filter-priority")?.addEventListener("change", () => renderTicketsSection());

  document.querySelectorAll(".js-status-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".js-status-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.statusFilter = btn.dataset.status;
      renderTicketsSection();
    });
  });

  // Users Filter
  document.querySelectorAll(".js-user-role-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".js-user-role-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.userRoleFilter = btn.dataset.role;
      renderUsersSection();
    });
  });
  document.getElementById("search-users-input")?.addEventListener("input", () => renderUsersSection());

  // File Upload Trigger Buttons
  document.querySelectorAll(".js-trigger-file-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target || "report";
      document.getElementById(`${target}-photo-input`)?.click();
    });
  });

  // Camera Open Buttons
  document.querySelectorAll(".js-open-camera-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target || "report";
      const canUseWebRtc = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1'));
      if (canUseWebRtc) {
        startDeviceCamera(target);
      } else {
        // Direct native camera capture input
        const camInp = document.getElementById(`${target}-camera-input`);
        if (camInp) {
          camInp.click();
        } else {
          document.getElementById(`${target}-photo-input`)?.click();
        }
      }
    });
  });

  document.querySelectorAll(".js-close-camera").forEach(btn => {
    btn.addEventListener("click", () => stopDeviceCamera());
  });

  document.getElementById("btn-fallback-native-camera")?.addEventListener("click", () => {
    stopDeviceCamera();
    const camInp = document.getElementById(`${currentCameraTarget}-camera-input`);
    if (camInp) {
      camInp.click();
    } else {
      document.getElementById(`${currentCameraTarget}-photo-input`)?.click();
    }
  });

  document.getElementById("btn-snap-photo")?.addEventListener("click", () => snapPhotoFromCamera());
  document.getElementById("btn-retake-snapshot")?.addEventListener("click", () => {
    document.getElementById("camera-snapshot-preview")?.classList.add("hidden");
    document.getElementById("camera-review-controls")?.classList.add("hidden");
    document.getElementById("camera-live-controls")?.classList.remove("hidden");
  });
  document.getElementById("btn-use-snapshot")?.addEventListener("click", () => {
    stopDeviceCamera();
    showToast("Photo captured and ready for submission!", "success");
    if (currentCameraTarget === "report") {
      setSubmitModalStep(2);
    }
  });

  // Step 1 & 2 Wizard Navigation
  document.getElementById("btn-skip-photo")?.addEventListener("click", () => {
    setSubmitModalStep(2);
  });
  document.getElementById("btn-retake-photo")?.addEventListener("click", () => {
    setSubmitModalStep(1);
  });
  document.getElementById("btn-switch-camera")?.addEventListener("click", () => {
    cameraFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
    startDeviceCamera(currentCameraTarget);
  });

  // File Input Change Handlers (Both standard file and camera capture)
  document.getElementById("report-photo-input")?.addEventListener("change", (e) => {
    handleUploadedFile(e.target.files?.[0], "report");
  });
  document.getElementById("report-camera-input")?.addEventListener("change", (e) => {
    handleUploadedFile(e.target.files?.[0], "report");
  });
  document.getElementById("fix-photo-input")?.addEventListener("change", (e) => {
    handleUploadedFile(e.target.files?.[0], "fix");
  });
  document.getElementById("fix-camera-input")?.addEventListener("change", (e) => {
    handleUploadedFile(e.target.files?.[0], "fix");
  });

  // Clear Photos
  document.querySelectorAll(".js-clear-photo-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      if (target === "report") {
        state.pendingReportPhotoDataUrl = "";
        state.pendingReportPhotoBlob = null;
        document.getElementById("report-photo-preview-wrap")?.classList.add("hidden");
        const hint = document.getElementById("report-upload-hint");
        if (hint) hint.textContent = "Photos or documents are stored securely in Telegram bot and linked in Firebase.";
      } else {
        state.pendingFixPhotoDataUrl = "";
        state.pendingFixPhotoBlob = null;
        document.getElementById("fix-photo-preview-wrap")?.classList.add("hidden");
        const hint = document.getElementById("fix-upload-hint");
        if (hint) hint.textContent = "Take a live photo of the repaired equipment or upload proof from files.";
      }
    });
  });

  // Modal Closers
  document.querySelectorAll(".js-close-dialog").forEach(btn => {
    btn.addEventListener("click", () => {
      const diag = document.getElementById(btn.dataset.dialog);
      if (diag?.open) diag.close();
    });
  });

  // Header quick buttons
  document.getElementById("btn-open-submit-modal")?.addEventListener("click", () => openSubmitTicketModal());
  document.getElementById("btn-open-create-store")?.addEventListener("click", () => document.getElementById("dialog-create-store")?.showModal());
  document.getElementById("btn-open-create-user")?.addEventListener("click", () => {
    const bSel = document.getElementById("new-user-branch");
    if (bSel) {
      bSel.innerHTML = state.stores.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    }
    document.getElementById("dialog-create-user")?.showModal();
  });
  document.getElementById("btn-open-pw-modal")?.addEventListener("click", () => document.getElementById("dialog-password")?.showModal());
  document.getElementById("btn-open-notifications")?.addEventListener("click", () => document.getElementById("dialog-notifications")?.showModal());

  // Create Store Form
  document.getElementById("create-store-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("store-name").value.trim();
    const code = document.getElementById("store-code").value.trim();
    const address = document.getElementById("store-address").value.trim();
    const phone = document.getElementById("store-phone").value.trim();
    if (!name || !address || !phone) return;

    state.stores.push({
      id: `branch_${Date.now()}`,
      code: code || "BR",
      name,
      address,
      phone,
      status: "active",
      createdAt: new Date().toISOString()
    });
    saveLocalState();
    document.getElementById("dialog-create-store")?.close();
    showToast(`Branch "${name}" added!`, "success");
    renderStoresSection();
  });

  // Edit Store Form
  document.getElementById("edit-store-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-store-id").value;
    const store = state.stores.find(x => x.id === id);
    if (!store) return;
    store.name = document.getElementById("edit-store-name").value.trim();
    store.address = document.getElementById("edit-store-address").value.trim();
    store.phone = document.getElementById("edit-store-phone").value.trim();
    saveLocalState();
    document.getElementById("dialog-edit-store")?.close();
    showToast("Branch updated successfully", "success");
    renderStoresSection();
  });

  // Create User Form
  document.getElementById("create-user-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const role = document.getElementById("new-user-role").value;
    const displayName = document.getElementById("new-user-display").value.trim();
    const branchId = document.getElementById("new-user-branch").value;
    const dept = document.getElementById("new-user-department").value.trim();
    const username = document.getElementById("new-user-username").value.trim().toLowerCase();
    const password = document.getElementById("new-user-password").value.trim();
    const phone = document.getElementById("new-user-phone").value.trim();
    const email = document.getElementById("new-user-email")?.value.trim() || `${username}@successo.ph`;

    if (!displayName || !username || !password || !phone) return;
    const branch = state.stores.find(b => b.id === branchId);

    state.users.push({
      id: `user_${Date.now()}`,
      username,
      password,
      role,
      displayName,
      email,
      department: dept || "Operations",
      branchId: branchId,
      branchName: branch?.name || "Main Branch",
      phone,
      createdAt: new Date().toISOString()
    });

    saveLocalState();
    document.getElementById("dialog-create-user")?.close();
    showToast(`User account @${username} created!`, "success");
    renderUsersSection();
  });

  // Telegram Settings Form
  document.getElementById("settings-telegram-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    state.settings.tgBotToken = document.getElementById("tg-bot-token").value.trim();
    state.settings.tgChatId = document.getElementById("tg-chat-id").value.trim();
    state.settings.slaHoursMax = parseInt(document.getElementById("sla-hours-max").value) || 72;
    saveLocalState();
    showToast("Telegram Storage & SLA parameters saved!", "success");
  });

  // Password Change Form
  document.getElementById("change-pw-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const newPw = document.getElementById("new-password-input").value.trim();
    if (!newPw) return;
    if (state.currentUser) {
      state.currentUser.password = newPw;
      const u = state.users.find(x => x.id === state.currentUser.id);
      if (u) u.password = newPw;
      saveLocalState();
      document.getElementById("dialog-password")?.close();
      showToast("Password updated successfully!", "success");
    }
  });

  // Mobile Bottom Navigation Bar Actions
  document.querySelectorAll(".js-mobile-nav-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      if (tabId) {
        switchTab(tabId);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
  document.querySelector(".js-mobile-open-notifs")?.addEventListener("click", () => {
    document.getElementById("dialog-notifications")?.showModal();
  });
  document.querySelector(".js-mobile-open-settings")?.addEventListener("click", () => {
    document.getElementById("dialog-password")?.showModal();
  });
  document.querySelector(".js-mobile-logout")?.addEventListener("click", () => {
    handleLogout();
  });
}

/* ==========================================================================
   13. AUTHENTICATION (Login / Logout)
   ========================================================================== */
function handleLogin(username, password) {
  const errBox = document.getElementById("login-error-box");
  if (errBox) errBox.classList.add("hidden");

  const user = state.users.find(u => u.username.toLowerCase() === (username || "").toLowerCase() && u.password === password);
  if (!user) {
    if (errBox) {
      errBox.textContent = "Invalid username or password. Please try one of the quick login cards below.";
      errBox.classList.remove("hidden");
    }
    return;
  }

  state.currentUser = user;
  saveLocalState();
  showToast(`Welcome back, ${user.displayName}! Signed in as ${user.role.toUpperCase()}.`, "success");
  renderAllViews();
}

function handleLogout() {
  state.currentUser = null;
  saveLocalState();
  showToast("You have been signed out.", "info");
  renderAllViews();
}

/* ==========================================================================
   14. MASTER VIEW RENDERER
   ========================================================================== */
function renderAllViews() {
  const authView = document.getElementById("auth-view");
  const appView = document.getElementById("app-view");

  if (!state.currentUser) {
    document.body.classList.remove("is-requester");
    authView?.classList.remove("hidden");
    appView?.classList.add("hidden");
    renderLoginAccountSelector();
    return;
  }

  const isReq = state.currentUser.role === "requester";
  document.body.classList.toggle("is-requester", isReq);

  authView?.classList.add("hidden");
  appView?.classList.remove("hidden");

  // Mobile Bottom Navigation Bar Visibility
  const mobileNav = document.getElementById("requester-mobile-nav");
  if (mobileNav) {
    if (isReq) {
      mobileNav.classList.remove("hidden");
    } else {
      mobileNav.classList.add("hidden");
    }
  }

  // Update Header Identity
  const roleBadge = document.getElementById("header-role-badge");
  const userSub = document.getElementById("header-user-subtitle");
  if (roleBadge) {
    roleBadge.textContent = state.currentUser.role.toUpperCase();
    const colors = { requester: "badge-primary", personnel: "badge-success", headadmin: "badge-warning", superadmin: "badge-purple" };
    roleBadge.className = `badge ${colors[state.currentUser.role] || "badge-primary"}`;
  }
  if (userSub) {
    userSub.textContent = `@${state.currentUser.username} • ${state.currentUser.displayName}`;
  }

  // Populate Telegram Settings Inputs
  const tgTokenInp = document.getElementById("tg-bot-token");
  const tgChatInp = document.getElementById("tg-chat-id");
  const slaMaxInp = document.getElementById("sla-hours-max");
  if (tgTokenInp) tgTokenInp.value = state.settings.tgBotToken || "";
  if (tgChatInp) tgChatInp.value = state.settings.tgChatId || "";
  if (slaMaxInp) slaMaxInp.value = state.settings.slaHoursMax || 72;

  renderQuickSwitchBar();
  renderSidebarNavigation();
  renderDashboardUI();
  renderTicketsSection();
  renderReportingDashboard();
  renderStoresSection();
  renderUsersSection();
}

/* ==========================================================================
   15. UTILITIES & FORMATTERS
   ========================================================================== */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateStr(isoStr) {
  if (!isoStr) return "—";
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (_) {
    return isoStr;
  }
}

function getPriorityBadgeClass(priority) {
  const p = (priority || "medium").toLowerCase();
  if (p === "urgent") return "badge-danger";
  if (p === "high") return "badge-warning";
  if (p === "low") return "badge-neutral";
  return "badge-primary";
}

function getPriorityBadge(priority) {
  const p = (priority || "medium").toLowerCase();
  const cls = getPriorityBadgeClass(p);
  return `<span class="badge ${cls}">${p.toUpperCase()}</span>`;
}

function getStatusBadgeClass(status) {
  const s = (status || "submitted").toLowerCase();
  if (s === "submitted") return "badge-primary";
  if (s === "assigned" || s === "in_progress") return "badge-warning";
  if (s === "pending_confirmation") return "badge-purple";
  if (s === "resolved") return "badge-success";
  if (s === "rejected") return "badge-danger";
  return "badge-neutral";
}

function getStatusBadgeText(status) {
  const s = (status || "submitted").toLowerCase();
  if (s === "submitted") return "NEEDS TRIAGE";
  if (s === "assigned") return "ASSIGNED";
  if (s === "in_progress") return "IN PROGRESS";
  if (s === "pending_confirmation") return "PENDING CONFIRMATION";
  if (s === "resolved") return "✓ RESOLVED";
  if (s === "rejected") return "REWORK REQUIRED";
  return s.toUpperCase();
}

function getStatusBadge(status) {
  const s = (status || "submitted").toLowerCase();
  const cls = getStatusBadgeClass(s);
  const text = getStatusBadgeText(s);
  return `<span class="badge ${cls}">${text}</span>`;
}

function getConcernIcon(type) {
  const map = {
    "Repair & Maintenance": "🔧",
    "Asset & Tools": "🛠️",
    "Marketing": "📢",
    "Compliance": "📋",
    "HRD": "👥",
    "Audit": "🔍",
    "Accounting": "💰",
    "Warehouse & Logistics": "🚚",
    "Supply & Inventory": "📦"
  };
  return map[type] || "📌";
}

/* ==========================================================================
   16. ENTRY POINT
   ========================================================================== */
function initApp() {
  loadLocalState();
  setupEventHandlers();
  renderAllViews();
  initFirebaseAndSync();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
