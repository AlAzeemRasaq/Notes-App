
// GLOBAL STATE

let allNotes = [];
let draggedNoteId = null;
let searchTimeout = null;
let currentRequestId = 0;

window.addEventListener("DOMContentLoaded", () => {
    const search = document.getElementById("searchInput");
    if (search) search.focus();
});

// PAGE DETECTION (SINGLE SOURCE OF TRUTH)

function getPage() {
    return document.body?.dataset?.page || "main";
}

function isArchivePage() {
    return getPage() === "archive";
}

function isTrashPage() {
    return getPage() === "trash";
}

// expose globally (for other files)
window.isArchivePage = isArchivePage;
window.isTrashPage = isTrashPage;

// GLOBAL UI STATE

window.autosaveTimers = window.autosaveTimers || {};
window.editHistory = window.editHistory || {};

// 🔍 Filters
let currentSearch = "";
let currentTag = null;

// 🔥 Bulk selection
let selectedNotes = new Set();
let selectMode = false;

// Sorting
let sortMode = "default";

// Pagination
let currentPage = 1;
let isLoadingMore = false;
let hasMore = true;

// Delete undo
let lastDeletedNote = null;
let undoTimeout = null;

// EDIT HISTORY STACKS

const editHistory = {}; // { noteId: { undo: [], redo: [] } }

// MARKDOWN PARSER

function parseMarkdown(text) {
    if (!text) return "";

    let parsed = text;

    parsed = parsed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    parsed = parsed.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    parsed = parsed.replace(/\*(.*?)\*/g, "<em>$1</em>");
    parsed = parsed.replace(/`(.*?)`/g, "<code>$1</code>");
    parsed = parsed.replace(/\n/g, "<br>");

    return parsed;
}

// DATE FORMAT

function formatDate(dateString) {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString();
}

// PREVIEW TEXT

function getPreviewText(html) {
    const temp = document.createElement("div");
    temp.innerHTML = html;

    temp.querySelectorAll("br").forEach(br => br.replaceWith("\n"));

    return temp.innerText;
}

// DEBOUNCE

function debounce(fn, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

window.debounce = debounce;

// THEME

function toggleTheme() {
    document.body.classList.toggle("light");
}

// expose globally
window.toggleTheme = toggleTheme;
