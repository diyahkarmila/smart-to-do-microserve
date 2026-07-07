import { useEffect, useState } from 'react';
import { login, register, getCategories, getTasks, createTask, createCategory } from './api';

const initialForm = { username: '', password: '', displayName: '' };
const initialTask = { title: '', description: '', categoryId: '', dueDate: '' };
const initialCategory = { name: '', color: '#4f46e5' };

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [authForm, setAuthForm] = useState(initialForm);
  const [mode, setMode] = useState('login');
  const [categories, setCategories] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskForm, setTaskForm] = useState(initialTask);
  const [categoryForm, setCategoryForm] = useState(initialCategory);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    const savedUser = localStorage.getItem('user');
    setUser(savedUser ? JSON.parse(savedUser) : null);
    loadData();
  }, [token]);

  async function loadData() {
    try {
      const [categoryRes, taskRes] = await Promise.all([getCategories(token), getTasks(token)]);
      setCategories(categoryRes.categories || []);
      setTasks(taskRes.tasks || []);
    } catch (error) {
      setMessage(error.message || 'Failed to load data');
    }
  }

  async function handleLogin() {
    try {
      const result = await login(authForm.username, authForm.password);
      setAuthForm(initialForm);
      setToken(result.token);
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      setUser(result.user);
      setMessage('Login berhasil');
    } catch (error) {
      setMessage(error.message || 'Login gagal');
    }
  }

  async function handleRegister() {
    try {
      const result = await register(authForm.username, authForm.password, authForm.displayName);
      setAuthForm(initialForm);
      setToken(result.token);
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      setUser(result.user);
      setMessage('Register berhasil');
    } catch (error) {
      setMessage(error.message || 'Register gagal');
    }
  }

  async function handleCreateCategory() {
    try {
      const result = await createCategory(categoryForm.name, categoryForm.color, token);
      setCategoryForm(initialCategory);
      setCategories((current) => [...current, result.category]);
      setMessage('Kategori ditambahkan');
    } catch (error) {
      setMessage(error.message || 'Gagal membuat kategori');
    }
  }

  async function handleCreateTask() {
    try {
      const payload = {
        title: taskForm.title,
        description: taskForm.description,
        categoryId: taskForm.categoryId ? Number(taskForm.categoryId) : null,
        dueDate: taskForm.dueDate || null
      };
      const result = await createTask(payload, token);
      setTaskForm(initialTask);
      setTasks((current) => [...current, result.task]);
      setMessage('Task ditambahkan');
    } catch (error) {
      setMessage(error.message || 'Gagal membuat task');
    }
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setMessage('Logout berhasil');
  }

  if (!token) {
    return (
      <div className="container">
        <h1>Smart To-Do Demo</h1>
        <div className="auth-card">
          <div className="toggle">
            <button onClick={() => setMode('login')} className={mode === 'login' ? 'active' : ''}>Login</button>
            <button onClick={() => setMode('register')} className={mode === 'register' ? 'active' : ''}>Register</button>
          </div>
          <div className="form-group">
            <label>Username</label>
            <input value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} />
          </div>
          {mode === 'register' && (
            <div className="form-group">
              <label>Display Name</label>
              <input value={authForm.displayName} onChange={(e) => setAuthForm({ ...authForm, displayName: e.target.value })} />
            </div>
          )}
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
          </div>
          <button onClick={mode === 'login' ? handleLogin : handleRegister}>{mode === 'login' ? 'Login' : 'Register'}</button>
          {message && <div className="message">{message}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <div>
          <h1>Smart To-Do Dashboard</h1>
          <p>Welcome, {user?.displayName || user?.username}</p>
        </div>
        <button className="logout" onClick={handleLogout}>Logout</button>
      </header>

      <section>
        <div className="panel">
          <h2>Kategori</h2>
          <div className="form-group">
            <label>Nama kategori</label>
            <input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Warna</label>
            <input type="color" value={categoryForm.color} onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })} />
          </div>
          <button onClick={handleCreateCategory}>Tambah kategori</button>
          <div className="list">
            {categories.map((category) => (
              <div key={category.id} className="list-item">
                <span className="dot" style={{ background: category.color }} />
                <div>{category.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Task</h2>
          <div className="form-group">
            <label>Judul task</label>
            <input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Deskripsi</label>
            <input value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Kategori</label>
            <select value={taskForm.categoryId} onChange={(e) => setTaskForm({ ...taskForm, categoryId: e.target.value })}>
              <option value="">Pilih kategori</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Due date</label>
            <input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
          </div>
          <button onClick={handleCreateTask}>Tambah task</button>
          <div className="list">
            {tasks.map((task) => (
              <div key={task.id} className="list-item task-item">
                <div>
                  <strong>{task.title}</strong>
                  <p>{task.description}</p>
                </div>
                <div>{task.status}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {message && <div className="message">{message}</div>}
    </div>
  );
}

export default App;
