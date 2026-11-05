/**
 * SuccessoReport — Internal Helpdesk & Issue Tracking System
 * --------------------------------------------------------------------------
 * Role-Based Access Control (RBAC):
 *   1. Requester (Employee): Submits tickets, tracks requests, confirms/rejects resolutions.
 *   2. Head Admin: Triages tickets, sets priority (Low/Med/High/Urgent), assigns to Internal/External, SLA monitoring, reports.
 *   3. Personnel (Internal/External): "My Tasks" view (defaults to today's tasks), marks done with proof photo.
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
  deleteDoc,
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
  { name: "Maria Clara", phone: "+639170000005", branchId: "branch_main", branchName: "Successo Store - Main Branch", department: "Marketing" },
  { name: "Jose Rizal", phone: "+639170000006", branchId: "branch_makati", branchName: "Successo Store - Makati Branch", department: "Supply & Inventory" },
  { name: "Andres Bonifacio", phone: "+639171110003", branchId: "branch_hub", branchName: "Successo Central Logistics Hub", department: "Warehouse & Logistics" },
  { name: "Gabriela Silang", phone: "+639171110004", branchId: "branch_main", branchName: "Successo Store - Main Branch", department: "HRD" },
  { name: "Emilio Aguinaldo", phone: "+639171110005", branchId: "branch_makati", branchName: "Successo Store - Makati Branch", department: "Accounting" }
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
/**
 * Calculates elapsed hours, remaining allowable hours (out of 72h), and SLA tier.
 * Tiers:
 *   - 'good'    : < 24h elapsed (Green)
 *   - 'warning' : 24h - 48h elapsed (Yellow Warning)
 *   - 'danger'  : 48h - 72h elapsed (Red Alert / Approaching Breach)
 *   - 'breached': > 72h elapsed (Critical Red / SLA Overdue)
 *   - 'resolved': Officially closed
 */
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
  dialog.showModal();

  if (cameraMediaStream) {
    cameraMediaStream.getTracks().forEach(t => t.stop());
  }

  try {
    cameraMediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = cameraMediaStream;
  } catch (err) {
    console.error("Camera access error:", err);
    errorBox.classList.remove("hidden");
    const errText = document.getElementById("camera-error-text");
    if (errText) errText.textContent = err.message || "Camera permission denied or camera not found.";
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
    } else {
      state.pendingFixPhotoDataUrl = dataUrl;
      state.pendingFixPhotoBlob = blob;
      const wrap = document.getElementById("fix-photo-preview-wrap");
      const img = document.getElementById("fix-photo-preview");
      if (wrap && img) { img.src = dataUrl; wrap.classList.remove("hidden"); }
    }
  }, "image/jpeg", 0.85);
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
    { id: "panel-dashboard", label: "My Requests", iconSvg: ICONS.dashboard },
    { id: "panel-tickets", label: "Track Tickets", iconSvg: ICONS.tickets }
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

  // 1. REQUESTER VIEW: My requests, confirmation alerts, submit button
  if (role === "requester") {
    const myTickets = state.tickets.filter(t => t.requesterId === state.currentUser.id || t.requesterName.toLowerCase().includes(state.currentUser.displayName.toLowerCase()));
    const pendingConfirm = myTickets.filter(t => t.status === "pending_confirmation");
    const activeTickets = myTickets.filter(t => t.status !== "resolved");

    container.innerHTML = `
      <div class="page-header-bar">
        <div>
          <h2 class="page-title">Welcome, ${state.currentUser.displayName}</h2>
          <p class="text-sm text-muted">Branch: <strong>${state.currentUser.branchName || "Main"}</strong> &bull; Department: <strong>${state.currentUser.department || "Employee"}</strong></p>
        </div>
        <div>
          <button type="button" class="btn btn-primary js-trigger-submit-modal">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
            <span>Submit New Ticket</span>
          </button>
        </div>
      </div>

      ${pendingConfirm.length > 0 ? `
        <div class="action-needed-banner" style="margin-bottom:1.25rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span class="pulse-indicator" style="background:var(--purple);"></span>
            <div>
              <strong>Action Required: ${pendingConfirm.length} Ticket(s) Waiting for Your Confirmation</strong>
              <div class="text-xs">Personnel completed the repair. Please verify and click 'Confirm Resolution' or 'Reject'.</div>
            </div>
          </div>
        </div>
      ` : ""}

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">My Total Tickets</div>
          <div class="kpi-value">${myTickets.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--primary);">Active / In Progress</div>
          <div class="kpi-value" style="color:var(--primary);">${activeTickets.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--purple);">Needs My Confirmation</div>
          <div class="kpi-value" style="color:var(--purple);">${pendingConfirm.length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--success);">Resolved &amp; Closed</div>
          <div class="kpi-value" style="color:var(--success);">${myTickets.filter(t => t.status === "resolved").length}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <h3 class="section-title">My Recent Tickets</h3>
          <span class="badge badge-neutral">${myTickets.length} Total</span>
        </div>
        <div class="flat-table-responsive" style="border:none;">
          <table class="flat-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Concern Type</th>
                <th>Title</th>
                <th>Priority</th>
                <th>SLA Elapsed</th>
                <th>Status</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${myTickets.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding:2rem;">No tickets submitted yet. Click "Submit New Ticket" to report an issue.</td></tr>` :
                myTickets.map(t => {
                  const sla = getTicketSlaInfo(t);
                  return `
                    <tr>
                      <td class="mono font-bold">${t.id}</td>
                      <td><span class="badge badge-concern">${t.concernType}</span></td>
                      <td><strong>${escapeHtml(t.title)}</strong></td>
                      <td>${getPriorityBadge(t.priority)}</td>
                      <td><span class="sla-badge ${sla.badgeClass}">${sla.label}</span></td>
                      <td>${getStatusBadge(t.status)}</td>
                      <td style="text-align:right;">
                        ${t.status === "pending_confirmation" ? `
                          <button type="button" class="btn btn-success btn-sm js-open-confirm-modal" data-id="${t.id}">
                            Confirm / Reject
                          </button>
                        ` : `
                          <button type="button" class="btn btn-outline btn-sm js-open-ticket-details" data-id="${t.id}">
                            ${ICONS.view}
                          </button>
                        `}
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

  // 2. HEAD ADMIN VIEW: Triage queue, SLA risk alarms, assignment summary
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
          <p class="text-sm text-muted">Review incoming requests, assign internal/external labor, and prevent 72-hour SLA breaches.</p>
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
          <div class="kpi-value" style="color:var(--warning);">${state.tickets.filter(t => t.status === "assigned" || t.status === "in_progress").length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--success);">Resolved Tickets</div>
          <div class="kpi-value" style="color:var(--success);">${state.tickets.filter(t => t.status === "resolved").length}</div>
        </div>
      </div>

      <!-- Triage Queue Card -->
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 class="section-title">New Ticket Triage Queue</h3>
            <p class="text-xs text-muted">Set priority level &amp; assign to internal staff or external contractor</p>
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
                <th>Requester</th>
                <th>Branch</th>
                <th>Reported At</th>
                <th style="text-align:right;">Triage Action</th>
              </tr>
            </thead>
            <tbody>
              ${unassigned.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding:2rem;">All tickets have been triaged and dispatched. Great job!</td></tr>` :
                unassigned.map(t => `
                  <tr>
                    <td class="mono font-bold">${t.id}</td>
                    <td><span class="badge badge-concern">${t.concernType}</span></td>
                    <td><strong>${escapeHtml(t.title)}</strong></td>
                    <td>${escapeHtml(t.requesterName)}</td>
                    <td>${escapeHtml(t.branchName)}</td>
                    <td class="text-xs text-muted mono">${formatDateStr(t.reportedAt)}</td>
                    <td style="text-align:right;">
                      <button type="button" class="btn btn-primary btn-sm js-open-triage-modal" data-id="${t.id}">
                        Triage &amp; Assign
                      </button>
                    </td>
                  </tr>
                `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 3. PERSONNEL VIEW: "My Tasks" dashboard defaulting to Today's Tasks
  else if (role === "personnel") {
    const myTasks = state.tickets.filter(t => t.assignedPersonnelId === state.currentUser.id || t.assignedPersonnelName.toLowerCase().includes(state.currentUser.displayName.toLowerCase()));
    const todayTasks = myTasks.filter(t => t.requestedDueDate === todayDateStr || t.status === "assigned" || t.status === "in_progress");
    const displayedTasks = state.todayOnlyTaskFilter ? todayTasks : myTasks;

    container.innerHTML = `
      <div class="page-header-bar">
        <div>
          <h2 class="page-title">Personnel Tasks: ${state.currentUser.displayName}</h2>
          <p class="text-sm text-muted">Assigned Queue &bull; Maximum allowable turnaround: <strong>72 Hours</strong></p>
        </div>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <button type="button" class="btn ${state.todayOnlyTaskFilter ? "btn-primary" : "btn-outline"} btn-sm js-toggle-personnel-today">
            ${state.todayOnlyTaskFilter ? "&#10003; Showing: Tasks for Today" : "Show: Today's Tasks Only"}
          </button>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Tasks to Do Today</div>
          <div class="kpi-value" style="color:var(--primary);">${todayTasks.filter(t => t.status !== "resolved").length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--warning);">Active / In Progress</div>
          <div class="kpi-value" style="color:var(--warning);">${myTasks.filter(t => t.status === "assigned" || t.status === "in_progress").length}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label" style="color:var(--purple);">Awaiting User Confirmation</div>
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
            <p class="text-xs text-muted">${state.todayOnlyTaskFilter ? "Filtered to active tasks due today" : "Showing all assigned tasks"}</p>
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
                  return `
                    <tr>
                      <td class="mono font-bold">${t.id}</td>
                      <td>${getPriorityBadge(t.priority)}</td>
                      <td><span class="badge badge-concern">${t.concernType}</span></td>
                      <td>
                        <strong>${escapeHtml(t.title)}</strong>
                        <div class="text-xs text-muted">${escapeHtml(t.branchName)}</div>
                      </td>
                      <td class="mono text-xs">${t.requestedDueDate || "ASAP"}</td>
                      <td><span class="sla-badge ${sla.badgeClass}">${sla.label}</span></td>
                      <td>${getStatusBadge(t.status)}</td>
                      <td style="text-align:right;">
                        ${(t.status === "assigned" || t.status === "in_progress" || t.status === "rejected") ? `
                          <button type="button" class="btn btn-success btn-sm js-open-done-modal" data-id="${t.id}">
                            ${ICONS.check} Mark Done
                          </button>
                        ` : `
                          <button type="button" class="btn btn-outline btn-sm js-open-ticket-details" data-id="${t.id}">
                            ${ICONS.view}
                          </button>
                        `}
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
            <p class="text-xs text-muted">Real-time status across all departments and locations</p>
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
              ${state.tickets.slice(0, 6).map(t => {
                const sla = getTicketSlaInfo(t);
                return `
                  <tr>
                    <td class="mono font-bold">${t.id}</td>
                    <td>${getPriorityBadge(t.priority)}</td>
                    <td><span class="badge badge-concern">${t.concernType}</span></td>
                    <td><strong>${escapeHtml(t.title)}</strong></td>
                    <td>${escapeHtml(t.branchName)}</td>
                    <td>${escapeHtml(t.assignedPersonnelName || "Unassigned")}</td>
                    <td><span class="sla-badge ${sla.badgeClass}">${sla.label}</span></td>
                    <td>${getStatusBadge(t.status)}</td>
                    <td style="text-align:right;">
                      <button type="button" class="btn btn-outline btn-sm js-open-ticket-details" data-id="${t.id}" title="View details">
                        ${ICONS.view}
                      </button>
                      ${t.status === "submitted" ? `
                        <button type="button" class="btn btn-primary btn-sm js-open-triage-modal" data-id="${t.id}" title="Triage">
                          Triage
                        </button>
                      ` : ""}
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
    filtered = filtered.filter(t => t.requesterId === state.currentUser.id || t.requesterName.toLowerCase().includes(state.currentUser.displayName.toLowerCase()));
  } else if (state.currentUser.role === "personnel") {
    filtered = filtered.filter(t => t.assignedPersonnelId === state.currentUser.id || t.assignedPersonnelName.toLowerCase().includes(state.currentUser.displayName.toLowerCase()));
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
      t.requesterName.toLowerCase().includes(q) ||
      t.branchName.toLowerCase().includes(q) ||
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
  if (kpiInProg) kpiInProg.textContent = state.tickets.filter(t => t.status === "assigned" || t.status === "in_progress").length;
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

  tbody.innerHTML = filtered.map(t => {
    const sla = getTicketSlaInfo(t);
    return `
      <tr class="clickable-row js-open-ticket-details" data-id="${t.id}">
        <td class="mono font-bold">${t.id}</td>
        <td>${getPriorityBadge(t.priority)}</td>
        <td><span class="badge badge-concern">${t.concernType}</span></td>
        <td>
          <strong>${escapeHtml(t.title)}</strong>
          <div class="text-xs text-muted">By: ${escapeHtml(t.requesterName)}</div>
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
            <button type="button" class="btn btn-outline btn-sm js-open-ticket-details" data-id="${t.id}" title="View ticket timeline">
              ${ICONS.view}
            </button>
            ${(state.currentUser.role === "headadmin" || state.currentUser.role === "superadmin") && t.status === "submitted" ? `
              <button type="button" class="btn btn-primary btn-sm js-open-triage-modal" data-id="${t.id}" title="Triage ticket">
                Triage
              </button>
            ` : ""}
            ${(state.currentUser.role === "personnel" || state.currentUser.role === "superadmin") && (t.status === "assigned" || t.status === "in_progress") ? `
              <button type="button" class="btn btn-success btn-sm js-open-done-modal" data-id="${t.id}" title="Mark as Done">
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
      if (t.status === "assigned" || t.status === "in_progress") groups[key].inProgress++;
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
      (u.phone && u.phone.includes(q)) ||
      (u.branchName && u.branchName.toLowerCase().includes(q))
    );
  }

  if (countBadge) countBadge.textContent = `${list.length} Users`;

  // Update counters
  document.getElementById("kpi-users-total").textContent = state.users.length;
  document.getElementById("kpi-users-stores").textContent = state.users.filter(u => u.role === "requester").length;
  document.getElementById("kpi-users-fixers").textContent = state.users.filter(u => u.role === "personnel").length;
  document.getElementById("kpi-users-admins").textContent = state.users.filter(u => u.role === "headadmin" || u.role === "superadmin").length;

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
          <div class="mono text-xs text-muted">@${u.username} &bull; PW: ${u.password}</div>
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
function openSubmitTicketModal() {
  const dialog = document.getElementById("dialog-submit-ticket");
  if (!dialog) return;

  // Pre-populate employee list
  const reqSelect = document.getElementById("ticket-requester-select");
  if (reqSelect) {
    reqSelect.innerHTML = `<option value="" disabled selected>Select employee...</option>` +
      PREPOPULATED_EMPLOYEES.map(e => `
        <option value="${escapeHtml(e.name)}" data-phone="${e.phone}" data-branch="${e.branchId}">
          ${escapeHtml(e.name)} — ${escapeHtml(e.department)} (${escapeHtml(e.branchName)})
        </option>
      `).join("");

    // If current user is requester, auto-select them
    if (state.currentUser.role === "requester") {
      const match = PREPOPULATED_EMPLOYEES.find(e => e.name.toLowerCase() === state.currentUser.displayName.toLowerCase());
      if (match) {
        reqSelect.value = match.name;
        document.getElementById("ticket-contact-phone").value = match.phone;
      }
    }
  }

  // Pre-populate branches dropdown
  const branchSelect = document.getElementById("ticket-branch-select");
  if (branchSelect) {
    branchSelect.innerHTML = state.stores.map(s => `
      <option value="${s.id}" ${state.currentUser.branchId === s.id ? "selected" : ""}>
        ${escapeHtml(s.name)}
      </option>
    `).join("");
  }

  // Set default due date to tomorrow or today
  const dueInput = document.getElementById("ticket-due-date");
  if (dueInput && !dueInput.value) {
    dueInput.value = todayDateStr;
  }

  dialog.showModal();
}

function openTriageModal(ticketId) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const dialog = document.getElementById("dialog-triage-ticket");
  document.getElementById("triage-ticket-id").value = ticket.id;
  document.getElementById("triage-modal-subtitle").textContent = `${ticket.id} • ${ticket.branchName}`;

  const infoBox = document.getElementById("triage-info-box");
  if (infoBox) {
    infoBox.innerHTML = `
      <div><strong>Title:</strong> ${escapeHtml(ticket.title)}</div>
      <div><strong>Concern Type:</strong> ${escapeHtml(ticket.concernType)}</div>
      <div><strong>Requester:</strong> ${escapeHtml(ticket.requesterName)} (${ticket.contactNumber})</div>
      <div><strong>Reported:</strong> ${formatDateStr(ticket.reportedAt)}</div>
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
      btnToggleReject.textContent = "Submit Rejection & Send Back";
    } else {
      const reason = rejectInput.value.trim();
      if (!reason) {
        showToast("Please enter a reason for rejection.", "danger");
        return;
      }
      ticket.status = "rejected";
      ticket.rejectionReason = reason;
      await persistTicket(ticket);
      dialog.close();
      showToast("Ticket rejected and sent back to personnel for rework.", "info");
      renderAllViews();
    }
  };

  dialog?.showModal();
}

function openTicketDetailsModal(ticketId) {
  const ticket = state.tickets.find(t => t.id === ticketId);
  if (!ticket) return;

  const dialog = document.getElementById("dialog-ticket-details");
  document.getElementById("ticket-modal-id").textContent = ticket.id;
  document.getElementById("ticket-modal-subtitle").textContent = `${ticket.branchName} • Due: ${ticket.requestedDueDate || "ASAP"}`;

  const prioBadge = document.getElementById("ticket-modal-prio-badge");
  if (prioBadge) prioBadge.outerHTML = getPriorityBadge(ticket.priority);

  const sla = getTicketSlaInfo(ticket);
  const slaBadge = document.getElementById("ticket-modal-sla-badge");
  if (slaBadge) {
    slaBadge.className = `sla-badge ${sla.badgeClass}`;
    slaBadge.textContent = sla.label;
  }

  const statusBadge = document.getElementById("ticket-modal-status-badge");
  if (statusBadge) statusBadge.outerHTML = getStatusBadge(ticket.status);

  const modalBody = document.getElementById("ticket-modal-body");
  const issuePhoto = ticket.attachments?.[0]?.url || "";
  const proofPhoto = ticket.doneProofUrl || "";

  if (modalBody) {
    modalBody.innerHTML = `
      <div style="background:var(--bg-muted); padding:1rem; border-radius:var(--radius-md);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
          <div>
            <span class="badge badge-concern" style="margin-bottom:0.35rem;">${ticket.concernType}</span>
            <h4 style="font-size:1.1rem; font-weight:800; margin:0 0 0.35rem 0;">${escapeHtml(ticket.title)}</h4>
            <p style="margin:0; font-size:0.875rem; color:var(--text-secondary);">${escapeHtml(ticket.description)}</p>
          </div>
          <div style="text-align:right;">
            <div class="text-xs text-muted">Reported by</div>
            <strong>${escapeHtml(ticket.requesterName)}</strong>
            <div class="mono text-xs">${ticket.contactNumber}</div>
          </div>
        </div>
      </div>

      <div class="report-images-row ${proofPhoto ? "has-two" : ""}">
        <div class="report-image-col">
          <div class="report-image-col-header">
            <span>Issue Photo (Reported by Requester)</span>
            <span class="badge badge-neutral">ATTACHMENT</span>
          </div>
          <div class="report-image-box">
            ${issuePhoto ? `<img src="${issuePhoto}" alt="Issue photo" class="js-lightbox-trigger" data-src="${issuePhoto}" style="cursor:pointer;" />` : `<div style="padding:2.5rem; text-align:center;">No image attached</div>`}
          </div>
        </div>
        ${proofPhoto ? `
          <div class="report-image-col">
            <div class="report-image-col-header">
              <span>Resolution Proof (By Personnel)</span>
              <span class="badge badge-success">COMPLETED</span>
            </div>
            <div class="report-image-box">
              <img src="${proofPhoto}" alt="Proof photo" class="js-lightbox-trigger" data-src="${proofPhoto}" style="cursor:pointer;" />
            </div>
          </div>
        ` : ""}
      </div>

      <!-- Lifecycle Timeline Stepper -->
      <div style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1rem;">
        <h4 style="font-size:0.85rem; font-weight:700; text-transform:uppercase; margin-bottom:0.75rem; color:var(--text-secondary);">Lifecycle Audit Trail</h4>
        <div style="display:flex; flex-direction:column; gap:0.65rem; font-size:0.8125rem;">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="color:var(--success); font-weight:700;">&#10003; 1. Submitted:</span>
            <span>By ${escapeHtml(ticket.requesterName)} at ${formatDateStr(ticket.reportedAt)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="${ticket.triagedAt ? "color:var(--success); font-weight:700;" : "color:var(--text-muted);"}">${ticket.triagedAt ? "&#10003;" : "&bull;"} 2. Triaged &amp; Assigned:</span>
            <span>${ticket.triagedAt ? `Assigned to ${escapeHtml(ticket.assignedPersonnelName || "External")} on ${formatDateStr(ticket.triagedAt)}` : "Awaiting triage by Head Admin"}</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="${ticket.doneAt ? "color:var(--success); font-weight:700;" : "color:var(--text-muted);"}">${ticket.doneAt ? "&#10003;" : "&bull;"} 3. Personnel Execution:</span>
            <span>${ticket.doneAt ? `Completed on ${formatDateStr(ticket.doneAt)} — "${escapeHtml(ticket.doneNotes)}"` : "Pending completion by assigned personnel"}</span>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="${ticket.resolvedAt ? "color:var(--success); font-weight:700;" : "color:var(--text-muted);"}">${ticket.resolvedAt ? "&#10003;" : "&bull;"} 4. Requester Verification:</span>
            <span>${ticket.resolvedAt ? `Officially confirmed and closed on ${formatDateStr(ticket.resolvedAt)}` : (ticket.rejectionReason ? `Rejected: "${escapeHtml(ticket.rejectionReason)}"` : "Pending final requester sign-off")}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Add lightbox triggers
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

  dialog?.showModal();
}

function attachDynamicActionListeners() {
  document.querySelectorAll(".js-open-ticket-details").forEach(btn => {
    btn.onclick = () => openTicketDetailsModal(btn.dataset.id);
  });
  document.querySelectorAll(".js-open-triage-modal").forEach(btn => {
    btn.onclick = () => openTriageModal(btn.dataset.id);
  });
  document.querySelectorAll(".js-open-done-modal").forEach(btn => {
    btn.onclick = () => openDoneModal(btn.dataset.id);
  });
  document.querySelectorAll(".js-open-confirm-modal").forEach(btn => {
    btn.onclick = () => openConfirmModal(btn.dataset.id);
  });
  document.querySelectorAll(".js-trigger-submit-modal").forEach(btn => {
    btn.onclick = () => openSubmitTicketModal();
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
    const concern = document.getElementById("ticket-concern-type").value;
    const title = document.getElementById("ticket-title").value.trim();
    const description = document.getElementById("ticket-description").value.trim();
    const requesterName = document.getElementById("ticket-requester-select").value;
    const contactPhone = document.getElementById("ticket-contact-phone").value.trim();
    const branchId = document.getElementById("ticket-branch-select").value;
    const dueDate = document.getElementById("ticket-due-date").value;

    if (!concern || !title || !description || !requesterName || !contactPhone || !branchId || !dueDate) {
      showToast("Please fill in all required fields.", "danger");
      return;
    }

    const branch = state.stores.find(b => b.id === branchId);
    const btnSave = document.getElementById("btn-submit-ticket-save");
    if (btnSave) { btnSave.disabled = true; btnSave.textContent = "Uploading to Telegram & Saving..."; }

    // Upload attachment via Telegram Bot API
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
        fileName: "camera_capture.jpg"
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

  // Requester dropdown change auto-fills contact and branch
  document.getElementById("ticket-requester-select")?.addEventListener("change", (e) => {
    const selected = PREPOPULATED_EMPLOYEES.find(x => x.name === e.target.value);
    if (selected) {
      document.getElementById("ticket-contact-phone").value = selected.phone;
      const bSelect = document.getElementById("ticket-branch-select");
      if (bSelect) bSelect.value = selected.branchId;
    }
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

    let proofUrl = createFlatSvgPlaceholder("#16a34a", "COMPLETED REPAIR", ticket.title);
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

    showToast(`Task ${ticket.id} marked done! Awaiting Requester confirmation.`, "success");
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

  // Camera Open Buttons
  document.querySelectorAll(".js-open-camera-btn").forEach(btn => {
    btn.addEventListener("click", () => startDeviceCamera(btn.dataset.target || "report"));
  });
  document.querySelectorAll(".js-close-camera").forEach(btn => {
    btn.addEventListener("click", () => stopDeviceCamera());
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
  });
  document.getElementById("btn-switch-camera")?.addEventListener("click", () => {
    cameraFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
    startDeviceCamera(currentCameraTarget);
  });

  // File Input Change Handlers
  document.getElementById("report-photo-input")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => {
        state.pendingReportPhotoDataUrl = re.target.result;
        state.pendingReportPhotoBlob = file;
        const wrap = document.getElementById("report-photo-preview-wrap");
        const img = document.getElementById("report-photo-preview");
        if (wrap && img) { img.src = re.target.result; wrap.classList.remove("hidden"); }
      };
      reader.readAsDataURL(file);
    }
  });

  document.getElementById("fix-photo-input")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => {
        state.pendingFixPhotoDataUrl = re.target.result;
        state.pendingFixPhotoBlob = file;
        const wrap = document.getElementById("fix-photo-preview-wrap");
        const img = document.getElementById("fix-photo-preview");
        if (wrap && img) { img.src = re.target.result; wrap.classList.remove("hidden"); }
      };
      reader.readAsDataURL(file);
    }
  });

  // Clear Photos
  document.querySelectorAll(".js-clear-photo-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      if (target === "report") {
        state.pendingReportPhotoDataUrl = "";
        state.pendingReportPhotoBlob = null;
        document.getElementById("report-photo-preview-wrap")?.classList.add("hidden");
      } else {
        state.pendingFixPhotoDataUrl = "";
        state.pendingFixPhotoBlob = null;
        document.getElementById("fix-photo-preview-wrap")?.classList.add("hidden");
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
    // Populate branch select
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

    if (!displayName || !username || !password || !phone) return;
    const branch = state.stores.find(b => b.id === branchId);

    state.users.push({
      id: `user_${Date.now()}`,
      username,
      password,
      role,
      displayName,
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
    authView?.classList.remove("hidden");
    appView?.classList.add("hidden");
    renderLoginAccountSelector();
    return;
  }

  authView?.classList.add("hidden");
  appView?.classList.remove("hidden");

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

function getPriorityBadge(priority) {
  const p = (priority || "medium").toLowerCase();
  if (p === "urgent") return `<span class="badge badge-danger">URGENT</span>`;
  if (p === "high") return `<span class="badge badge-warning">HIGH</span>`;
  if (p === "low") return `<span class="badge badge-neutral">LOW</span>`;
  return `<span class="badge badge-primary">MEDIUM</span>`;
}

function getStatusBadge(status) {
  const s = (status || "submitted").toLowerCase();
  if (s === "submitted") return `<span class="badge badge-primary">NEEDS TRIAGE</span>`;
  if (s === "assigned") return `<span class="badge badge-warning">ASSIGNED</span>`;
  if (s === "in_progress") return `<span class="badge badge-warning">IN PROGRESS</span>`;
  if (s === "pending_confirmation") return `<span class="badge badge-purple">PENDING CONFIRMATION</span>`;
  if (s === "resolved") return `<span class="badge badge-success">&#10003; RESOLVED</span>`;
  if (s === "rejected") return `<span class="badge badge-danger">REJECTED</span>`;
  return `<span class="badge badge-neutral">${s.toUpperCase()}</span>`;
}

/* ==========================================================================
   16. ENTRY POINT
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  loadLocalState();
  setupEventHandlers();
  renderAllViews();
  initFirebaseAndSync();
});
