// Orbit App State Manager
const API_BASE = "/api";
let currentToken = localStorage.getItem("orbit_token") || null;
let currentUser = null;
let currentView = "dashboard";
let socket = null;

// Chart.js instance references
let progressChart = null;
let categoryChart = null;
let priorityChart = null;

// Calendar State
let calendarDate = new Date();

// DOM Elements
const authScreen = document.getElementById("auth-screen");
const mainWorkspace = document.getElementById("main-workspace");
const sidebarNav = document.getElementById("sidebar-nav");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const btnAuthSubmit = document.getElementById("btn-auth-submit");
const linkAuthToggle = document.getElementById("link-auth-toggle");
const authToggleText = document.getElementById("auth-toggle-text");
const groupEmail = document.getElementById("group-email");
const authEmail = document.getElementById("auth-email");
const authUsername = document.getElementById("auth-username");
const authPassword = document.getElementById("auth-password");
const labelUsername = document.getElementById("label-username");

const btnLogout = document.getElementById("btn-logout");
const profileUsername = document.getElementById("profile-username");
const profileAvatar = document.getElementById("profile-avatar");

const navItems = document.querySelectorAll(".nav-item");
const viewSections = document.querySelectorAll(".view-section");
const viewTitle = document.getElementById("view-title");
const viewSubtitle = document.getElementById("view-subtitle");

const btnOpenCreateModal = document.getElementById("btn-open-create-modal");
const taskModal = document.getElementById("task-modal");
const btnCloseTaskModal = document.getElementById("btn-close-task-modal");
const btnCancelTaskForm = document.getElementById("btn-cancel-task-form");
const taskForm = document.getElementById("task-form");

// Toast Notification Manager
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let icon = "fa-circle-info";
    if (type === "success") icon = "fa-circle-check";
    if (type === "error") icon = "fa-circle-exclamation";
    
    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <div class="toast-message">${message}</div>
        <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
    `;
    
    // Bind close button
    toast.querySelector(".toast-close").addEventListener("click", () => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(50px)";
        setTimeout(() => toast.remove(), 300);
    });
    
    container.appendChild(toast);
    
    // Auto remove
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = "0";
            toast.style.transform = "translateX(50px)";
            setTimeout(() => toast.remove(), 300);
        }
    }, 4500);
}

// Global API Fetch wrapper
async function apiRequest(endpoint, method = "GET", body = null) {
    const headers = {
        "Content-Type": "application/json"
    };
    
    if (currentToken) {
        headers["Authorization"] = `Bearer ${currentToken}`;
    }
    
    const options = { method, headers };
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, options);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || "Something went wrong");
        }
        return data;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        if (error.message.includes("Could not validate credentials")) {
            logout();
        }
        throw error;
    }
}

// Establish WebSockets for real-time synchronization
function connectWebSocket() {
    if (socket) {
        socket.close();
    }
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/tasks/ws?token=${currentToken}`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log("WebSocket connected successfully");
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("WebSocket message received:", data);
        
        // Show Toast
        if (data.event === "task_created") {
            showToast(`Task "${data.task.title}" was created on another device`, "info");
        } else if (data.event === "task_updated") {
            showToast(`Task "${data.task.title}" was updated on another device`, "info");
        } else if (data.event === "task_deleted") {
            showToast("A task was deleted on another device", "info");
        }
        
        // Refresh active views
        refreshActiveView();
    };
    
    socket.onclose = () => {
        console.log("WebSocket disconnected. Retrying in 5s...");
        setTimeout(() => {
            if (currentToken) connectWebSocket();
        }, 5000);
    };
    
    socket.onerror = (err) => {
        console.error("WebSocket error:", err);
    };
}

// Authentication Logic
let isRegisterMode = false;

linkAuthToggle.addEventListener("click", (e) => {
    e.preventDefault();
    isRegisterMode = !isRegisterMode;
    
    if (isRegisterMode) {
        authTitle.innerText = "Create Account";
        authSubtitle.innerText = "Get started with Orbit. Let's create your workspace.";
        btnAuthSubmit.innerText = "Register";
        authToggleText.innerText = "Already have an account?";
        linkAuthToggle.innerText = "Sign In instead";
        groupEmail.style.display = "block";
        authEmail.required = true;
        labelUsername.innerText = "Username";
        authUsername.placeholder = "alex_workspace";
    } else {
        authTitle.innerText = "Orbit";
        authSubtitle.innerText = "Welcome back. Enter your workspace credentials.";
        btnAuthSubmit.innerText = "Sign In";
        authToggleText.innerText = "Don't have an account?";
        linkAuthToggle.innerText = "Register here";
        groupEmail.style.display = "none";
        authEmail.required = false;
        labelUsername.innerText = "Username or Email";
        authUsername.placeholder = "alex";
    }
});

authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const username = authUsername.value.trim();
    const password = authPassword.value.trim();
    
    if (isRegisterMode) {
        const email = authEmail.value.trim();
        try {
            await apiRequest("/auth/register", "POST", { username, email, password });
            showToast("Registration successful! You can now log in.", "success");
            // Switch to login mode
            linkAuthToggle.click();
            authPassword.value = "";
        } catch (error) {
            showToast(error.message, "error");
        }
    } else {
        try {
            const data = await apiRequest("/auth/login", "POST", { username, password });
            currentToken = data.access_token;
            localStorage.setItem("orbit_token", currentToken);
            currentUser = data.user;
            
            showToast(`Welcome back, ${data.user.username}!`, "success");
            initWorkspace();
        } catch (error) {
            showToast(error.message, "error");
        }
    }
});

function logout() {
    currentToken = null;
    currentUser = null;
    localStorage.removeItem("orbit_token");
    if (socket) {
        socket.close();
        socket = null;
    }
    
    authScreen.style.display = "flex";
    mainWorkspace.style.display = "none";
    sidebarNav.style.display = "none";
    
    authUsername.value = "";
    authPassword.value = "";
    authEmail.value = "";
}

btnLogout.addEventListener("click", () => {
    logout();
    showToast("Signed out successfully", "success");
});

async function verifyAuth() {
    if (!currentToken) {
        logout();
        return;
    }
    try {
        currentUser = await apiRequest("/auth/me");
        initWorkspace();
    } catch (error) {
        logout();
    }
}

function initWorkspace() {
    authScreen.style.display = "none";
    mainWorkspace.style.display = "block";
    sidebarNav.style.display = "flex";
    
    // Set profile widgets
    profileUsername.innerText = currentUser.username;
    profileAvatar.innerText = currentUser.username.charAt(0).toUpperCase();
    
    // Connect websocket
    connectWebSocket();
    
    // Load default view
    switchView("dashboard");
}

// Router / Views System
function switchView(viewName) {
    currentView = viewName;
    
    // Toggle active classes on nav
    navItems.forEach(item => {
        if (item.getAttribute("data-view") === viewName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
    
    // Toggle active classes on sections
    viewSections.forEach(section => {
        if (section.id === `view-${viewName}`) {
            section.classList.add("active");
        } else {
            section.classList.remove("active");
        }
    });
    
    // Set Headers
    const viewMeta = {
        dashboard: { title: "Dashboard Overview", subtitle: "Orbit workspace activity summary" },
        kanban: { title: "Kanban Board", subtitle: "Drag and drop tasks between lanes to update status" },
        list: { title: "Detailed Task List", subtitle: "Filter, search, and sort tasks tabularly" },
        calendar: { title: "Timeline Calendar", subtitle: "Manage task delivery deadlines chronologically" },
        analytics: { title: "Workspace Analytics", subtitle: "Data distribution visualizations" }
    };
    
    viewTitle.innerText = viewMeta[viewName].title;
    viewSubtitle.innerText = viewMeta[viewName].subtitle;
    
    // Refresh current view content
    refreshActiveView();
}

navItems.forEach(item => {
    item.addEventListener("click", () => {
        switchView(item.getAttribute("data-view"));
    });
});

function refreshActiveView() {
    if (!currentToken) return;
    
    if (currentView === "dashboard") {
        loadDashboardView();
    } else if (currentView === "kanban") {
        loadKanbanView();
    } else if (currentView === "list") {
        loadListView();
    } else if (currentView === "calendar") {
        loadCalendarView();
    } else if (currentView === "analytics") {
        loadAnalyticsView();
    }
}

// View Loader: Dashboard
async function loadDashboardView() {
    try {
        const tasks = await apiRequest("/tasks");
        
        // Compute stats
        const total = tasks.length;
        const todo = tasks.filter(t => t.status === "todo").length;
        const progress = tasks.filter(t => t.status === "in_progress").length;
        const completed = tasks.filter(t => t.status === "completed").length;
        
        document.getElementById("stat-total").innerText = total;
        document.getElementById("stat-todo").innerText = todo;
        document.getElementById("stat-progress").innerText = progress;
        document.getElementById("stat-completed").innerText = completed;
        
        // Completion rate donut chart
        const ctx = document.getElementById("dashboard-progress-chart").getContext("2d");
        if (progressChart) progressChart.destroy();
        
        progressChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Todo', 'In Progress', 'Completed'],
                datasets: [{
                    data: [todo, progress, completed],
                    backgroundColor: ['#60a5fa', '#fbbf24', '#34d399'],
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#9ca3af', font: { family: 'Inter', size: 11 } }
                    }
                },
                cutout: '70%'
            }
        });
        
        // Urgent / Upcoming task list (sorted by due date, incomplete only)
        const upcomingList = document.getElementById("dashboard-upcoming-list");
        upcomingList.innerHTML = "";
        
        const urgentTasks = tasks
            .filter(t => t.status !== "completed" && t.due_date)
            .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
            .slice(0, 5);
            
        if (urgentTasks.length === 0) {
            upcomingList.innerHTML = `
                <div style="text-align: center; color: var(--color-text-muted); font-size: 0.9rem; padding: 20px;">
                    No upcoming deadlines! Great job.
                </div>
            `;
        } else {
            const today = new Date().toISOString().split("T")[0];
            urgentTasks.forEach(task => {
                const isOverdue = task.due_date < today;
                const dateLabel = new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                
                const card = document.createElement("div");
                card.className = "task-card";
                card.style.cursor = "pointer";
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="task-title" style="margin-bottom: 0; font-size: 0.9rem;">${escapeHTML(task.title)}</span>
                        <span class="task-priority-badge priority-${task.priority}" style="padding: 1px 6px; font-size: 0.7rem;">${task.priority}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 0.75rem;">
                        <span class="task-category cat-${task.category}" style="padding: 1px 6px; font-size: 0.65rem;">${task.category}</span>
                        <span class="${isOverdue ? 'color-high' : 'color-text-muted'}" style="color: ${isOverdue ? 'var(--color-high)' : 'var(--color-text-muted)'}; font-weight: ${isOverdue ? '600' : 'normal'}">
                            <i class="fa-regular fa-calendar"></i> ${dateLabel} ${isOverdue ? '(Overdue)' : ''}
                        </span>
                    </div>
                `;
                
                card.addEventListener("click", () => openEditTaskModal(task));
                upcomingList.appendChild(card);
            });
        }
    } catch (err) {
        showToast("Error loading dashboard stats", "error");
    }
}

// View Loader: Kanban Board
async function loadKanbanView() {
    try {
        const tasks = await apiRequest("/tasks");
        
        const colTodo = document.getElementById("list-todo");
        const colProgress = document.getElementById("list-progress");
        const colDone = document.getElementById("list-done");
        
        colTodo.innerHTML = "";
        colProgress.innerHTML = "";
        colDone.innerHTML = "";
        
        let counts = { todo: 0, in_progress: 0, completed: 0 };
        
        tasks.forEach(task => {
            counts[task.status]++;
            const card = createTaskCard(task);
            
            if (task.status === "todo") {
                colTodo.appendChild(card);
            } else if (task.status === "in_progress") {
                colProgress.appendChild(card);
            } else if (task.status === "completed") {
                colDone.appendChild(card);
            }
        });
        
        document.getElementById("count-todo").innerText = counts.todo;
        document.getElementById("count-progress").innerText = counts.in_progress;
        document.getElementById("count-done").innerText = counts.completed;
        
        setupDragAndDrop();
    } catch (err) {
        showToast("Error loading tasks for board", "error");
    }
}

// Task Card creation helper
function createTaskCard(task) {
    const card = document.createElement("div");
    card.className = "task-card";
    card.setAttribute("draggable", "true");
    card.setAttribute("data-id", task.id);
    
    // Check if overdue
    const today = new Date().toISOString().split("T")[0];
    const isOverdue = task.due_date && task.due_date < today && task.status !== "completed";
    const dateText = task.due_date ? new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "";
    
    card.innerHTML = `
        <div class="task-card-header">
            <span class="task-category cat-${task.category}">${task.category}</span>
            <div class="task-card-actions">
                <button class="task-action-icon edit-btn" title="Edit Task"><i class="fa-solid fa-pen"></i></button>
                <button class="task-action-icon delete delete-btn" title="Delete Task"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
        <div class="task-title">${escapeHTML(task.title)}</div>
        <div class="task-desc">${task.description ? escapeHTML(task.description) : 'No details provided.'}</div>
        <div class="task-card-footer">
            <div class="task-due-date ${isOverdue ? 'overdue' : ''}">
                ${task.due_date ? `<i class="fa-regular fa-calendar-days"></i> <span>${dateText}</span>` : ""}
            </div>
            <span class="task-priority-badge priority-${task.priority}">${task.priority}</span>
        </div>
    `;
    
    // Action Events
    card.querySelector(".edit-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        openEditTaskModal(task);
    });
    
    card.querySelector(".delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteTask(task.id);
    });
    
    card.addEventListener("click", () => {
        openEditTaskModal(task);
    });
    
    return card;
}

// Drag & Drop Functionality
function setupDragAndDrop() {
    const cards = document.querySelectorAll(".task-card");
    const columns = document.querySelectorAll(".kanban-column");
    
    cards.forEach(card => {
        card.addEventListener("dragstart", (e) => {
            card.classList.add("dragging");
            e.dataTransfer.setData("text/plain", card.getAttribute("data-id"));
        });
        
        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
        });
    });
    
    columns.forEach(column => {
        column.addEventListener("dragover", (e) => {
            e.preventDefault();
            column.classList.add("drag-over");
        });
        
        column.addEventListener("dragleave", () => {
            column.classList.remove("drag-over");
        });
        
        column.addEventListener("drop", async (e) => {
            e.preventDefault();
            column.classList.remove("drag-over");
            
            const taskId = e.dataTransfer.getData("text/plain");
            const newStatus = column.getAttribute("data-status");
            
            if (taskId) {
                try {
                    await apiRequest(`/tasks/${taskId}`, "PUT", { status: newStatus });
                    showToast("Task status updated", "success");
                    loadKanbanView();
                } catch (err) {
                    showToast(err.message, "error");
                }
            }
        });
    });
}

// View Loader: List View
async function loadListView() {
    const search = document.getElementById("list-search").value.trim();
    const category = document.getElementById("filter-category").value;
    const priority = document.getElementById("filter-priority").value;
    const sortBy = document.getElementById("sort-by").value;
    const sortOrder = document.getElementById("sort-order").value;
    
    // Construct query parameters
    let params = [];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (category) params.push(`category=${category}`);
    if (priority) params.push(`priority=${priority}`);
    params.push(`sort_by=${sortBy}`);
    params.push(`sort_order=${sortOrder}`);
    
    const query = params.length > 0 ? `?${params.join("&")}` : "";
    
    try {
        const tasks = await apiRequest(`/tasks${query}`);
        const rowsContainer = document.getElementById("task-rows-container");
        rowsContainer.innerHTML = "";
        
        if (tasks.length === 0) {
            rowsContainer.innerHTML = `
                <div style="text-align: center; color: var(--color-text-muted); font-size: 1rem; padding: 40px; border: 1px dashed var(--border-glass); border-radius: 20px;">
                    <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; margin-bottom: 16px; display: block; opacity: 0.5;"></i>
                    No tasks found matching your filters.
                </div>
            `;
            return;
        }
        
        tasks.forEach(task => {
            const row = document.createElement("div");
            row.className = "task-row";
            
            const isCompleted = task.status === "completed";
            const dateText = task.due_date ? new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "-";
            
            row.innerHTML = `
                <div class="task-row-checkbox ${isCompleted ? 'checked' : ''}">
                    ${isCompleted ? '<i class="fa-solid fa-check"></i>' : ''}
                </div>
                <div class="task-row-info ${isCompleted ? 'completed' : ''}">
                    <h4>${escapeHTML(task.title)}</h4>
                    <p>${task.description ? escapeHTML(task.description) : 'No details.'}</p>
                </div>
                <div>
                    <span class="task-category cat-${task.category}">${task.category}</span>
                </div>
                <div>
                    <span class="task-priority-badge priority-${task.priority}">${task.priority}</span>
                </div>
                <div style="color: var(--color-text-muted); font-size: 0.85rem;">
                    <i class="fa-regular fa-calendar" style="margin-right: 6px;"></i>${dateText}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="task-action-icon edit-btn" style="font-size: 0.95rem;"><i class="fa-solid fa-pen"></i></button>
                    <button class="task-action-icon delete delete-btn" style="font-size: 0.95rem;"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            
            // Toggle complete
            row.querySelector(".task-row-checkbox").addEventListener("click", async (e) => {
                e.stopPropagation();
                const newStatus = isCompleted ? "todo" : "completed";
                try {
                    await apiRequest(`/tasks/${task.id}`, "PUT", { status: newStatus });
                    showToast(isCompleted ? "Task incomplete" : "Task completed", "success");
                    loadListView();
                } catch (err) {
                    showToast(err.message, "error");
                }
            });
            
            row.querySelector(".edit-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                openEditTaskModal(task);
            });
            
            row.querySelector(".delete-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                deleteTask(task.id);
            });
            
            row.addEventListener("click", () => {
                openEditTaskModal(task);
            });
            
            rowsContainer.appendChild(row);
        });
    } catch (err) {
        showToast("Error loading task list", "error");
    }
}

// Attach filter change listeners
document.getElementById("list-search").addEventListener("input", debounce(loadListView, 300));
document.getElementById("filter-category").addEventListener("change", loadListView);
document.getElementById("filter-priority").addEventListener("change", loadListView);
document.getElementById("sort-by").addEventListener("change", loadListView);
document.getElementById("sort-order").addEventListener("change", loadListView);

// View Loader: Calendar
async function loadCalendarView() {
    try {
        const tasks = await apiRequest("/tasks");
        
        const container = document.getElementById("calendar-grid-container");
        container.innerHTML = "";
        
        // Add Day Labels
        const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        dayLabels.forEach(label => {
            const div = document.createElement("div");
            div.className = "calendar-day-label";
            div.innerText = label;
            container.appendChild(div);
        });
        
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        
        // Set Month Title
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        document.getElementById("calendar-month-year").innerText = `${monthNames[month]} ${year}`;
        
        // Build Month calendar math
        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();
        const prevMonthTotalDays = new Date(year, month, 0).getDate();
        
        // Render Previous Month's trailing days
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const dayNum = prevMonthTotalDays - i;
            const cell = document.createElement("div");
            cell.className = "calendar-cell other-month";
            cell.innerHTML = `<div class="calendar-date-number">${dayNum}</div>`;
            container.appendChild(cell);
        }
        
        // Render Current Month's days
        const todayStr = new Date().toISOString().split("T")[0];
        
        for (let day = 1; day <= totalDays; day++) {
            const cell = document.createElement("div");
            cell.className = "calendar-cell";
            
            // Format date comparison key YYYY-MM-DD
            const cellDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            
            if (cellDateStr === todayStr) {
                cell.classList.add("today");
            }
            
            cell.innerHTML = `<div class="calendar-date-number">${day}</div>`;
            
            // Query tasks scheduled for this day
            const dayTasks = tasks.filter(t => t.due_date === cellDateStr);
            dayTasks.forEach(task => {
                const tag = document.createElement("div");
                tag.className = `calendar-task-tag cat-${task.category}`;
                tag.innerText = task.title;
                tag.title = `${task.title} (${task.priority} priority)`;
                
                tag.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openEditTaskModal(task);
                });
                
                cell.appendChild(tag);
            });
            
            container.appendChild(cell);
        }
        
        // Render Next Month's starting days (pad grid to 42 cells)
        const currentGridCount = firstDayIndex + totalDays;
        const remainingCells = 42 - currentGridCount;
        
        for (let i = 1; i <= remainingCells; i++) {
            const cell = document.createElement("div");
            cell.className = "calendar-cell other-month";
            cell.innerHTML = `<div class="calendar-date-number">${i}</div>`;
            container.appendChild(cell);
        }
    } catch (err) {
        showToast("Error loading calendar", "error");
    }
}

document.getElementById("btn-cal-prev").addEventListener("click", () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    loadCalendarView();
});

document.getElementById("btn-cal-next").addEventListener("click", () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    loadCalendarView();
});

// View Loader: Analytics
async function loadAnalyticsView() {
    try {
        const tasks = await apiRequest("/tasks");
        
        // Group by category
        const cats = { work: 0, personal: 0, shopping: 0, health: 0, other: 0 };
        tasks.forEach(t => cats[t.category]++);
        
        const catCanvas = document.getElementById("chart-category").getContext("2d");
        if (categoryChart) categoryChart.destroy();
        categoryChart = new Chart(catCanvas, {
            type: 'bar',
            data: {
                labels: ['Work', 'Personal', 'Shopping', 'Health', 'Other'],
                datasets: [{
                    label: 'Tasks',
                    data: [cats.work, cats.personal, cats.shopping, cats.health, cats.other],
                    backgroundColor: ['#818cf8', '#34d399', '#fb7185', '#fbbf24', '#a78bfa'],
                    borderWidth: 0,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', stepSize: 1 } }
                }
            }
        });
        
        // Group by priority
        const priorities = { high: 0, medium: 0, low: 0 };
        tasks.forEach(t => priorities[t.priority]++);
        
        const prioCanvas = document.getElementById("chart-priority").getContext("2d");
        if (priorityChart) priorityChart.destroy();
        priorityChart = new Chart(prioCanvas, {
            type: 'pie',
            data: {
                labels: ['High', 'Medium', 'Low'],
                datasets: [{
                    data: [priorities.high, priorities.medium, priorities.low],
                    backgroundColor: ['#f87171', '#fb7185', '#94a3b8'],
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#9ca3af', font: { family: 'Inter', size: 11 } }
                    }
                }
            }
        });
    } catch (err) {
        showToast("Error loading analytics reports", "error");
    }
}

// Task CRUD Action triggers
btnOpenCreateModal.addEventListener("click", () => {
    // Reset Form
    taskForm.reset();
    document.getElementById("task-form-id").value = "";
    document.getElementById("task-modal-title").innerText = "Create New Task";
    
    // Pre-select todo status
    document.getElementById("task-form-status").value = "todo";
    
    taskModal.classList.add("active");
});

function openEditTaskModal(task) {
    document.getElementById("task-form-id").value = task.id;
    document.getElementById("task-form-title").value = task.title;
    document.getElementById("task-form-desc").value = task.description || "";
    document.getElementById("task-form-priority").value = task.priority;
    document.getElementById("task-form-category").value = task.category;
    document.getElementById("task-form-due").value = task.due_date || "";
    document.getElementById("task-form-status").value = task.status;
    
    document.getElementById("task-modal-title").innerText = "Edit Task Details";
    taskModal.classList.add("active");
}

function closeTaskModal() {
    taskModal.classList.remove("active");
}

btnCloseTaskModal.addEventListener("click", closeTaskModal);
btnCancelTaskForm.addEventListener("click", closeTaskModal);

taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const taskId = document.getElementById("task-form-id").value;
    const title = document.getElementById("task-form-title").value.trim();
    const description = document.getElementById("task-form-desc").value.trim();
    const priority = document.getElementById("task-form-priority").value;
    const category = document.getElementById("task-form-category").value;
    const due_date = document.getElementById("task-form-due").value || null;
    const status = document.getElementById("task-form-status").value;
    
    const taskPayload = { title, description, priority, category, due_date, status };
    
    try {
        if (taskId) {
            // Update
            await apiRequest(`/tasks/${taskId}`, "PUT", taskPayload);
            showToast("Task updated successfully", "success");
        } else {
            // Create
            await apiRequest("/tasks", "POST", taskPayload);
            showToast("Task created successfully", "success");
        }
        
        closeTaskModal();
        refreshActiveView();
    } catch (err) {
        showToast(err.message, "error");
    }
});

async function deleteTask(taskId) {
    if (confirm("Are you sure you want to delete this task?")) {
        try {
            await apiRequest(`/tasks/${taskId}`, "DELETE");
            showToast("Task deleted successfully", "success");
            refreshActiveView();
        } catch (err) {
            showToast(err.message, "error");
        }
    }
}

// Utility Helpers
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Application bootstrapping
window.addEventListener("DOMContentLoaded", () => {
    verifyAuth();
});
