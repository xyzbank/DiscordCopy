class ChatApp {
    constructor() {
        this.currentUser = null;
        this.friends = new Map();
        this.chats = new Map();
        this.activeChat = null;
        this.unsubscribeFunctions = [];

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.checkAuth();
        this.setupListeners();
    }

    bindEvents() {
        // Переключение вкладок авторизации
        document.querySelectorAll('.auth-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchAuthTab(tab);
            });
        });

        // Форма входа
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.login();
        });

        // Форма регистрации
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.register();
        });

        // Вход через Google
        document.getElementById('googleLogin').addEventListener('click', () => {
            this.loginWithProvider(new firebase.auth.GoogleAuthProvider());
        });

        // Вход через GitHub
        document.getElementById('githubLogin').addEventListener('click', () => {
            this.loginWithProvider(new firebase.auth.GithubAuthProvider());
        });

        // Показать/скрыть пароль
        document.querySelectorAll('.show-password').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.closest('.show-password').dataset.target;
                const input = document.getElementById(targetId);
                input.type = input.type === 'password' ? 'text' : 'password';
                e.target.querySelector('i').classList.toggle('fa-eye');
                e.target.querySelector('i').classList.toggle('fa-eye-slash');
            });
        });

        // Переключение вкладок боковой панели
        document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.closest('.tab-btn').dataset.tab;
                this.switchSidebarTab(tab);
            });
        });

        // Отправка сообщения
        document.getElementById('sendMessageBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Добавление друга
        document.getElementById('addFriendBtn').addEventListener('click', () => {
            this.showAddFriendModal();
        });

        document.getElementById('sendFriendRequest').addEventListener('click', async () => {
            await this.sendFriendRequest();
        });

        // Выход
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Закрытие модальных окон
        document.querySelectorAll('.close-modal, .close-notifications').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal, .notifications-panel').forEach(el => {
                    el.classList.add('hidden');
                });
            });
        });

        // Клик по фону для закрытия модалок
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });
    }

    switchAuthTab(tab) {
        document.querySelectorAll('.auth-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
        document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
    }

    switchSidebarTab(tab) {
        document.querySelectorAll('.sidebar-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        document.querySelectorAll('.list').forEach(list => {
            list.classList.toggle('active', list.id === `${tab}List`);
        });
    }

    async checkAuth() {
        try {
            // Показываем загрузку
            document.getElementById('loadingScreen').style.display = 'flex';
            
            // Слушаем изменения состояния авторизации
            firebaseAuth.onAuthStateChanged(async (user) => {
                if (user) {
                    this.currentUser = user;
                    await this.loadUserData(user.uid);
                    this.showMainApp();
                } else {
                    this.showAuthScreen();
                }
                document.getElementById('loadingScreen').style.display = 'none';
            });
        } catch (error) {
            console.error('Ошибка проверки авторизации:', error);
            this.showAuthScreen();
        }
    }

    async login() {
        try {
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            await firebaseAuth.signInWithEmailAndPassword(email, password);
            // Успешный вход обрабатывается в onAuthStateChanged
        } catch (error) {
            this.showError('Ошибка входа', error.message);
        }
    }

    async register() {
        try {
            const name = document.getElementById('registerName').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('registerConfirmPassword').value;

            if (password !== confirmPassword) {
                throw new Error('Пароли не совпадают');
            }

            if (password.length < 6) {
                throw new Error('Пароль должен содержать минимум 6 символов');
            }

            // Создаем пользователя
            const userCredential = await firebaseAuth.createUserWithEmailAndPassword(email, password);
            
            // Сохраняем дополнительную информацию
            await firebaseDb.collection('users').doc(userCredential.user.uid).set({
                uid: userCredential.user.uid,
                displayName: name,
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'online',
                lastSeen: new Date().toISOString()
            });

            // Обновляем профиль Firebase
            await userCredential.user.updateProfile({
                displayName: name
            });

        } catch (error) {
            this.showError('Ошибка регистрации', error.message);
        }
    }

    async loginWithProvider(provider) {
        try {
            await firebaseAuth.signInWithPopup(provider);
        } catch (error) {
            this.showError('Ошибка входа', error.message);
        }
    }

    async loadUserData(userId) {
        try {
            // Загружаем профиль пользователя
            const userDoc = await firebaseDb.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                this.updateUserUI(userData);
            }

            // Настраиваем реальные слушатели
            this.setupRealtimeListeners(userId);
            
        } catch (error) {
            console.error('Ошибка загрузки данных пользователя:', error);
        }
    }

    setupRealtimeListeners(userId) {
        // Слушатель друзей
        const friendsUnsubscribe = firebaseDb.collection('friendships')
            .where('users', 'array-contains', userId)
            .where('status', '==', 'accepted')
            .onSnapshot(snapshot => {
                this.friends.clear();
                snapshot.forEach(doc => {
                    const friendship = doc.data();
                    const friendId = friendship.users.find(id => id !== userId);
                    this.friends.set(friendId, friendship);
                });
                this.updateFriendsList();
            });

        this.unsubscribeFunctions.push(friendsUnsubscribe);

        // Слушатель входящих запросов дружбы
        const requestsUnsubscribe = firebaseDb.collection('friendships')
            .where('receiverId', '==', userId)
            .where('status', '==', 'pending')
            .onSnapshot(snapshot => {
                this.updateFriendRequests(snapshot);
            });

        this.unsubscribeFunctions.push(requestsUnsubscribe);

        // Слушатель сообщений
        const messagesUnsubscribe = firebaseDb.collection('messages')
            .where('participants', 'array-contains', userId)
            .orderBy('timestamp', 'desc')
            .limit(20)
            .onSnapshot(snapshot => {
                this.updateChatsList(snapshot);
            });

        this.unsubscribeFunctions.push(messagesUnsubscribe);
    }

    updateUserUI(userData) {
        document.getElementById('userName').textContent = userData.displayName || 'Пользователь';
        document.getElementById('userStatus').textContent = userData.status || 'online';
        document.getElementById('userStatus').className = `status ${userData.status || 'online'}`;
        
        // Устанавливаем аватар
        const avatar = document.getElementById('userAvatar');
        if (userData.photoURL) {
            avatar.src = userData.photoURL;
        } else {
            // Генерируем аватар по умолчанию
            const initials = userData.displayName ? userData.displayName.charAt(0).toUpperCase() : 'U';
            avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.displayName || 'User')}&background=${this.stringToColor(userData.displayName || 'User')}&color=fff`;
        }
    }

    stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        let color = '#';
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 0xFF;
            color += ('00' + value.toString(16)).substr(-2);
        }
        return color;
    }

    async updateFriendsList() {
        const friendsList = document.querySelector('#friendsList .list-items');
        friendsList.innerHTML = '';

        if (this.friends.size === 0) {
            friendsList.innerHTML = '<p class="no-data">У вас пока нет друзей</p>';
            document.getElementById('friendsCount').textContent = '0';
            return;
        }

        document.getElementById('friendsCount').textContent = this.friends.size;

        // Загружаем информацию о каждом друге
        for (const [friendId, friendship] of this.friends) {
            try {
                const friendDoc = await firebaseDb.collection('users').doc(friendId).get();
                if (friendDoc.exists) {
                    const friendData = friendDoc.data();
                    const friendElement = this.createFriendElement(friendData, friendship);
                    friendsList.appendChild(friendElement);
                }
            } catch (error) {
                console.error('Ошибка загрузки информации о друге:', error);
            }
        }
    }

    createFriendElement(friendData, friendship) {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.dataset.userId = friendData.uid;
        
        // Генерируем аватар
        let avatarSrc;
        if (friendData.photoURL) {
            avatarSrc = friendData.photoURL;
        } else {
            avatarSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(friendData.displayName || 'Friend')}&background=${this.stringToColor(friendData.displayName || 'Friend')}&color=fff`;
        }
        
        div.innerHTML = `
            <img src="${avatarSrc}" alt="${friendData.displayName}">
            <div class="friend-info">
                <h5>${friendData.displayName || 'Друг'}</h5>
                <small class="status ${friendData.status || 'offline'}">${friendData.status || 'offline'}</small>
            </div>
        `;
        
        div.addEventListener('click', () => {
            this.openChat(friendData.uid, friendData.displayName);
        });
        
        return div;
    }

    async openChat(friendId, friendName) {
        this.activeChat = friendId;
        
        // Обновляем UI чата
        document.getElementById('noChatSelected').classList.add('hidden');
        document.getElementById('activeChat').classList.remove('hidden');
        
        document.getElementById('chatPartnerName').textContent = friendName;
        document.getElementById('chatPartnerStatus').textContent = 'online';
        
        // Загружаем сообщения
        await this.loadChatMessages(friendId);
        
        // Настраиваем слушатель новых сообщений
        this.setupChatListener(friendId);
    }

    async loadChatMessages(friendId) {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '';
        
        try {
            // Получаем сообщения между текущим пользователем и другом
            const chatId = [this.currentUser.uid, friendId].sort().join('_');
            
            const messagesSnapshot = await firebaseDb.collection('messages')
                .where('chatId', '==', chatId)
                .orderBy('timestamp', 'asc')
                .limit(50)
                .get();
            
            messagesSnapshot.forEach(doc => {
                const message = doc.data();
                this.appendMessageToChat(message);
            });
            
            // Прокручиваем вниз
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
        } catch (error) {
            console.error('Ошибка загрузки сообщений:', error);
        }
    }

    setupChatListener(friendId) {
        // Отписываемся от предыдущего слушателя
        if (this.chatUnsubscribe) {
            this.chatUnsubscribe();
        }
        
        const chatId = [this.currentUser.uid, friendId].sort().join('_');
        
        this.chatUnsubscribe = firebaseDb.collection('messages')
            .where('chatId', '==', chatId)
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const message = change.doc.data();
                        this.appendMessageToChat(message);
                        
                        // Прокручиваем вниз
                        const messagesContainer = document.getElementById('messagesContainer');
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                });
            });
    }

    appendMessageToChat(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        const isOwnMessage = message.senderId === this.currentUser.uid;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwnMessage ? 'outgoing' : 'incoming'}`;
        
        const time = new Date(message.timestamp?.toDate() || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageDiv.innerHTML = `
            <div class="message-text">${this.escapeHtml(message.text)}</div>
            <div class="message-time">${time}</div>
        `;
        
        messagesContainer.appendChild(messageDiv);
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        
        if (!text || !this.activeChat) return;
        
        try {
            const chatId = [this.currentUser.uid, this.activeChat].sort().join('_');
            
            const message = {
                chatId: chatId,
                senderId: this.currentUser.uid,
                receiverId: this.activeChat,
                text: text,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                participants: [this.currentUser.uid, this.activeChat],
                read: false
            };
            
            await firebaseDb.collection('messages').add(message);
            
            // Очищаем поле ввода
            input.value = '';
            
            // Обновляем высоту textarea
            input.style.height = 'auto';
            
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            this.showError('Ошибка отправки', 'Не удалось отправить сообщение');
        }
    }

    async sendFriendRequest() {
        const emailInput = document.getElementById('addFriendEmail');
        const email = emailInput.value.trim();
        
        if (!email) {
            this.showError('Ошибка', 'Введите email друга');
            return;
        }
        
        if (email === this.currentUser.email) {
            this.showError('Ошибка', 'Вы не можете добавить себя в друзья');
            return;
        }
        
        try {
            // Ищем пользователя по email
            const usersSnapshot = await firebaseDb.collection('users')
                .where('email', '==', email)
                .limit(1)
                .get();
            
            if (usersSnapshot.empty) {
                this.showError('Ошибка', 'Пользователь с таким email не найден');
                return;
            }
            
            const friendDoc = usersSnapshot.docs[0];
            const friendId = friendDoc.id;
            
            // Проверяем, не отправлен ли уже запрос
            const existingRequest = await firebaseDb.collection('friendships')
                .where('users', 'array-contains', this.currentUser.uid)
                .where('users', 'array-contains', friendId)
                .limit(1)
                .get();
            
            if (!existingRequest.empty) {
                this.showError('Ошибка', 'Запрос уже отправлен или пользователь уже в друзьях');
                return;
            }
            
            // Отправляем запрос
            await firebaseDb.collection('friendships').add({
                users: [this.currentUser.uid, friendId],
                senderId: this.currentUser.uid,
                receiverId: friendId,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            emailInput.value = '';
            document.getElementById('addFriendModal').classList.add('hidden');
            
            this.showSuccess('Запрос отправлен', 'Запрос на добавление в друзья отправлен');
            
        } catch (error) {
            console.error('Ошибка отправки запроса дружбы:', error);
            this.showError('Ошибка', 'Не удалось отправить запрос');
        }
    }

    updateFriendRequests(snapshot) {
        const notificationCount = document.getElementById('notificationCount');
        const count = snapshot.size;
        
        if (count > 0) {
            notificationCount.textContent = count;
            notificationCount.classList.remove('hidden');
        } else {
            notificationCount.classList.add('hidden');
        }
    }

    updateChatsList(snapshot) {
        const chatsList = document.querySelector('#chatsList .list-items');
        chatsList.innerHTML = '';
        
        snapshot.forEach(doc => {
            const message = doc.data();
            this.addChatToList(message);
        });
    }

    addChatToList(message) {
        // Логика добавления чата в список
        // Реализуйте по аналогии с друзьями
    }

    showAddFriendModal() {
        document.getElementById('addFriendModal').classList.remove('hidden');
    }

    showAuthScreen() {
        document.getElementById('authScreen').classList.remove('hidden');
        document.getElementById('mainScreen').classList.add('hidden');
    }

    showMainApp() {
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('mainScreen').classList.remove('hidden');
    }

    async logout() {
        try {
            // Обновляем статус перед выходом
            await firebaseDb.collection('users').doc(this.currentUser.uid).update({
                status: 'offline',
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Отписываемся от всех слушателей
            this.unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
            this.unsubscribeFunctions = [];
            
            if (this.chatUnsubscribe) {
                this.chatUnsubscribe();
                this.chatUnsubscribe = null;
            }
            
            // Выходим
            await firebaseAuth.signOut();
            
            // Сбрасываем состояние
            this.currentUser = null;
            this.friends.clear();
            this.chats.clear();
            this.activeChat = null;
            
        } catch (error) {
            console.error('Ошибка выхода:', error);
        }
    }

    showError(title, message) {
        // Можно использовать Toast или уведомление
        alert(`${title}: ${message}`);
    }

    showSuccess(title, message) {
        alert(`${title}: ${message}`);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
});
