(() => {
  const STORAGE_KEY = "todo.tasks.v1";

  const form = document.getElementById("add-form");
  const input = document.getElementById("task-input");
  const dueInput = document.getElementById("due-input");
  const priorityInput = document.getElementById("priority-input");
  const tagsInput = document.getElementById("tags-input");
  const list = document.getElementById("task-list");
  const emptyState = document.getElementById("empty-state");
  const countLabel = document.getElementById("count-label");
  const clearCompletedBtn = document.getElementById("clear-completed");
  const filterButtons = document.querySelectorAll(".filter-btn");
  const tagFiltersEl = document.getElementById("tag-filters");
  const todayLabel = document.getElementById("today");

  let tasks = loadTasks();
  let currentFilter = "all";
  let currentTag = null;

  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  const PRIORITY_ORDER = { high: 0, mid: 1, low: 2 };
  const PRIORITY_LABEL = { high: "高", mid: "中", low: "低" };

  function todayISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function parseTags(raw) {
    if (!raw) return [];
    const seen = new Set();
    const tags = [];
    for (const part of raw.split(",")) {
      const tag = part.trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
    return tags;
  }

  function allTags() {
    const seen = new Map();
    for (const task of tasks) {
      for (const tag of task.tags || []) {
        const key = tag.toLowerCase();
        if (!seen.has(key)) seen.set(key, tag);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, "ja"));
  }

  function renderTagFilters() {
    const tags = allTags();
    if (tags.length === 0) {
      tagFiltersEl.hidden = true;
      tagFiltersEl.innerHTML = "";
      if (currentTag) currentTag = null;
      return;
    }
    if (currentTag && !tags.includes(currentTag)) currentTag = null;

    tagFiltersEl.hidden = false;
    tagFiltersEl.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className = "tag-filter-btn" + (currentTag === null ? " active" : "");
    allBtn.textContent = "すべてのタグ";
    allBtn.addEventListener("click", () => {
      currentTag = null;
      render();
    });
    tagFiltersEl.appendChild(allBtn);

    for (const tag of tags) {
      const btn = document.createElement("button");
      btn.className = "tag-filter-btn" + (currentTag === tag ? " active" : "");
      btn.textContent = tag;
      btn.addEventListener("click", () => {
        currentTag = currentTag === tag ? null : tag;
        render();
      });
      tagFiltersEl.appendChild(btn);
    }
  }

  function render() {
    renderTagFilters();

    const filtered = tasks.filter((t) => {
      if (currentFilter === "active" && t.completed) return false;
      if (currentFilter === "completed" && !t.completed) return false;
      if (currentTag && !(t.tags || []).some((tag) => tag.toLowerCase() === currentTag.toLowerCase())) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const pa = PRIORITY_ORDER[a.priority] ?? 1;
      const pb = PRIORITY_ORDER[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return b.createdAt - a.createdAt;
    });

    list.innerHTML = "";
    const today = todayISO();

    for (const task of sorted) {
      const li = document.createElement("li");
      li.className = "task-item" + (task.completed ? " completed" : "");
      li.dataset.id = task.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-checkbox";
      checkbox.checked = task.completed;
      checkbox.setAttribute("aria-label", "完了にする");
      checkbox.addEventListener("change", () => toggleTask(task.id));

      const main = document.createElement("div");
      main.className = "task-main";

      const text = document.createElement("div");
      text.className = "task-text";
      text.textContent = task.text;
      text.title = "クリックして編集";
      text.addEventListener("click", () => startEdit(text, task.id));

      const meta = document.createElement("div");
      meta.className = "task-meta";

      const badge = document.createElement("span");
      badge.className = "priority-badge " + task.priority;
      badge.textContent = PRIORITY_LABEL[task.priority] ?? "中";
      meta.appendChild(badge);

      if (task.due) {
        const dueSpan = document.createElement("span");
        dueSpan.className = "due-badge" + (!task.completed && task.due < today ? " overdue" : "");
        dueSpan.textContent = "期限: " + task.due;
        meta.appendChild(dueSpan);
      }

      for (const tag of task.tags || []) {
        const tagSpan = document.createElement("span");
        tagSpan.className = "tag-badge";
        tagSpan.textContent = "#" + tag;
        meta.appendChild(tagSpan);
      }

      main.appendChild(text);
      main.appendChild(meta);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.innerHTML = "&times;";
      deleteBtn.setAttribute("aria-label", "削除");
      deleteBtn.addEventListener("click", () => deleteTask(task.id));

      li.appendChild(checkbox);
      li.appendChild(main);
      li.appendChild(deleteBtn);
      list.appendChild(li);
    }

    emptyState.hidden = sorted.length !== 0;

    const remaining = tasks.filter((t) => !t.completed).length;
    countLabel.textContent = `${remaining} 件残り`;
  }

  function startEdit(textEl, id) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.completed) return;

    textEl.contentEditable = "true";
    textEl.focus();

    const range = document.createRange();
    range.selectNodeContents(textEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const commit = () => {
      textEl.contentEditable = "false";
      const newText = textEl.textContent.trim();
      if (newText && newText !== task.text) {
        task.text = newText;
        saveTasks();
      } else {
        textEl.textContent = task.text;
      }
      textEl.removeEventListener("blur", commit);
      textEl.removeEventListener("keydown", onKeydown);
    };

    const onKeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        textEl.blur();
      } else if (e.key === "Escape") {
        textEl.textContent = task.text;
        textEl.blur();
      }
    };

    textEl.addEventListener("blur", commit);
    textEl.addEventListener("keydown", onKeydown);
  }

  function toggleTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    saveTasks();
    render();
  }

  function deleteTask(id) {
    tasks = tasks.filter((t) => t.id !== id);
    saveTasks();
    render();
  }

  function addTask(text, due, priority, tags) {
    tasks.push({
      id: uid(),
      text,
      completed: false,
      due: due || null,
      priority: priority || "mid",
      tags: tags || [],
      createdAt: Date.now(),
    });
    saveTasks();
    render();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addTask(text, dueInput.value, priorityInput.value, parseTags(tagsInput.value));
    input.value = "";
    dueInput.value = "";
    priorityInput.value = "mid";
    tagsInput.value = "";
    input.focus();
  });

  clearCompletedBtn.addEventListener("click", () => {
    tasks = tasks.filter((t) => !t.completed);
    saveTasks();
    render();
  });

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      render();
    });
  });

  todayLabel.textContent = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  render();
})();
