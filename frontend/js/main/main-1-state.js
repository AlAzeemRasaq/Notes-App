// ================= GLOBAL STATE =================
// Centralised state shared across multiple UI modules

let allNotes = [];            // Cached notes from API (used for rendering & filtering)
let draggedNoteId = null;    // Tracks note being dragged (for reorder feature)
let searchTimeout = null;    // Used for debounced search (avoid spamming API)
let currentRequestId = 0;    // Prevents race conditions from overlapping requests

// Focus search bar on page load for better UX
window.addEventListener("DOMContentLoaded", () => {
    const search = document.getElementById("searchInput");
    if (search) search.focus();
});


// ================= PAGE DETECTION =================
// Single source of truth for current page (main / archive / trash)
// Uses data-page attribute on <body> for clean separation from JS logic

function getPage() {
    return document.body?.dataset?.page || "main";
}

function isArchivePage() {
    return getPage() === "archive";
}

function isTrashPage() {
    return getPage() === "trash";
}

// Expose globally so other JS files can reuse this logic
window.isArchivePage = isArchivePage;
window.isTrashPage = isTrashPage;


// ================= GLOBAL UI STATE =================
// Shared UI-related state across components

window.autosaveTimers = window.autosaveTimers || {}; // per-note autosave timers
window.editHistory = window.editHistory || {};       // undo/redo tracking

// 🔍 Active filters
let currentSearch = "";   // current search query
let currentTag = null;    // selected tag filter

// 🔥 Bulk selection mode (multi-select UI)
let selectedNotes = new Set(); // store selected note IDs efficiently
let selectMode = false;        // whether selection mode is active

// Sorting mode (e.g. default, date, etc.)
let sortMode = "default";

// Pagination state (infinite scroll / load more)
let currentPage = 1;
let isLoadingMore = false; // prevents duplicate fetch calls
let hasMore = true;        // indicates if more data exists

// Undo delete feature
let lastDeletedNote = null;
let undoTimeout = null;


// ================= EDIT HISTORY STACKS =================
// Stores undo/redo stacks per note
// Structure: { noteId: { undo: [...], redo: [...] } }

const editHistory = {};


// ================= MARKDOWN PARSER =================
// Lightweight client-side markdown support for previews
// Converts basic markdown → safe HTML

function parseMarkdown(text) {
    if (!text) return "";

    let parsed = text;

    // Escape HTML first to prevent injection
    parsed = parsed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Basic markdown transformations
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    parsed = parsed.replace(/\*(.*?)\*/g, "<em>$1</em>");
    parsed = parsed.replace(/`(.*?)`/g, "<code>$1</code>");
    parsed = parsed.replace(/\n/g, "<br>");

    return parsed;
}


// ================= DATE FORMAT =================
// Formats ISO date strings into readable local time

function formatDate(dateString) {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString();
}


// ================= PREVIEW TEXT =================
// Converts HTML content → plain text preview (for note cards)

function getPreviewText(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;

    // Preserve line breaks
    temp.querySelectorAll("br").forEach(br => br.replaceWith("\n"));

    return temp.innerText;
}


// ================= DEBOUNCE =================
// Prevents rapid repeated function calls (e.g. search input)
// Only executes after user stops typing

function debounce(fn, delay = 300) {
    let timeout;

    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// Expose globally for reuse across modules
window.debounce = debounce;


// ================= THEME =================
// Simple light/dark mode toggle via CSS class

function toggleTheme() {
    document.body.classList.toggle("light");
}

window.toggleTheme = toggleTheme;


// ================= GLOBAL ERROR HANDLING =================
// Catches unhandled promise rejections (async errors)
// Prevents silent failures and improves debugging

window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled:", e.reason);

    // Show user-friendly error message
    showToast(e.reason?.message || "Unexpected error", "error");
});
