// ===== GLOBAL STATE =====
let allNotes = [];
let draggedNoteId = null;
let searchTimeout = null;
let currentRequestId = 0; // 🆕 tracks latest request
window.addEventListener("DOMContentLoaded", () => {
    const search = document.getElementById("searchInput");
    if (search) {
        search.focus();
    }
});

// ===== SAFE PAGE DETECTION =====
function isArchivePage() {
    return document.body?.dataset?.page === "archive";
}

function isTrashPage() {
    return document.body?.dataset?.page === "trash";
}

// ===== AUTOSAVE STATE =====
let autosaveTimers = {};

// ===== DELETE UX STATE =====
let lastDeletedNote = null;
let undoTimeout = null;

// 🔍 Unified filter state
let currentSearch = "";
let currentTag = null;

// 🔥 Bulk selection state
let selectedNotes = new Set();
let selectMode = false; // toggles checkbox mode

// Sort mode (default, date, title)
let sortMode = "default";

// More states
let currentPage = 1;
let isLoadingMore = false;
let hasMore = true;

// ===== EDIT HISTORY STACKS =====
const editHistory = {}; // { noteId: { undo: [], redo: [] } }

// ===== SIMPLE MARKDOWN PARSER =====
function parseMarkdown(text) {
    if (!text) return "";

    let parsed = text;

    // Escape HTML first (prevent XSS issues)
    parsed = parsed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Bold **text**
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic *text*
    parsed = parsed.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Inline code `text`
    parsed = parsed.replace(/`(.*?)`/g, "<code>$1</code>");

    // Line breaks
    parsed = parsed.replace(/\n/g, "<br>");

    return parsed;
}

// ===== DATE FORMATTING =====
function formatDate(dateString) {
    if (!dateString) return "";

    const date = new Date(dateString);
    return date.toLocaleString(); // simple + clean
}

// ===== PREVIEW TEXT (STRIP HTML + LIMIT) =====
function getPreviewText(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;

    // Convert <br> to line breaks
    temp.querySelectorAll("br").forEach(br => br.replaceWith("\n"));

    return temp.innerText;
}

// ===== DEBOUNCE UTILITY =====
function debounce(fn, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// ===== THEME TOGGLE =====
function toggleTheme() {
    document.body.classList.toggle("light");
}