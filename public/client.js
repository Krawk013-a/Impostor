document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // Elementos da UI
    const screens = {
        home: document.getElementById('home-screen'),
        lobby: document.getElementById('lobby-screen'),
        game: document.getElementById('game-screen'),
        voting: document.getElementById('voting-screen'),
        end: document.getElementById('end-screen'),
    };

    const playerNameInput = document.getElementById('player-name-input');
    const createRoomBtn = document.getElementById('create-room-btn');
    const roomCodeInput = document.getElementById('room-code-input');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const homeError = document.getElementById('home-error');
    
    const roomCodeDisplay = document.getElementById('room-code-display');
    const playerList = document.getElementById('player-list');
    const startGameBtn = document.getElementById('start-game-btn');
    
    const roleInfo = document.getElementById('role-info');
    const themeInfo = document.getElementById('theme-info');
    const wordDisplay = document.getElementById('word-display');
    const themeDisplay = document.getElementById('theme-display');
    const turnInfo = document.getElementById('turn-info');
    const clueInputContainer = document.getElementById('clue-input-container');
    const clueInput = document.getElementById('clue-input');
    const submitClueBtn = document.getElementById('submit-clue-btn');
    const clueList = document.getElementById('clue-list');
    
    const votingButtons = document.getElementById('voting-buttons');
    
    const endTitle = document.getElementById('end-title');
    const endSubtitle = document.getElementById('end-subtitle');
    const impostorWas = document.getElementById('impostor-was');
    const secretWordWas = document.getElementById('secret-word-was');
    const finalCluesList = document.getElementById('final-clues-list');
    const impostorGuessBox = document.getElementById('impostor-guess-box');
    const impostorGuessInput = document.getElementById('impostor-guess-input');
    const submitGuessBtn = document.getElementById('submit-guess-btn');
    const playAgainBtn = document.getElementById('play-again-btn');

    let currentRoomCode = '';
    let isHost = false;

    // Funções Auxiliares
    const switchScreen = (screenName) => {
        Object.values(screens).forEach(screen => screen.classList.remove('active'));
        screens[screenName].classList.add('active');
    };

    const updatePlayerList = (players) => {
        playerList.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.name} ${player.id === socket.id ? '(Você)' : ''}`;
            if (player.id === socket.id && isHost) {
                 li.textContent += ' ⭐';
            }
            playerList.appendChild(li);
        });
    };
    
    // Handlers de Eventos do DOM
    createRoomBtn.addEventListener('click', () => {
        const playerName = playerNameInput.value.trim();
        if (playerName) {
            homeError.textContent = '';
            socket.emit('createRoom', playerName);
            isHost = true;
        } else {
            homeError.textContent = 'Por favor, digite seu nome.';
        }
    });

    joinRoomBtn.addEventListener('click', () => {
        const playerName = playerNameInput.value.trim();
        const roomCode = roomCodeInput.value.trim().toUpperCase();
        if (playerName && roomCode) {
            homeError.textContent = '';
            socket.emit('joinRoom', { roomCode, playerName });
        } else {
            homeError.textContent = 'Por favor, digite seu nome e o código da sala.';
        }
    });
    
    startGameBtn.addEventListener('click', () => {
        socket.emit('startGame', currentRoomCode);
    });

    submitClueBtn.addEventListener('click', () => {
        const clue = clueInput.value.trim();
        if (clue) {
            socket.emit('submitClue', { roomCode: currentRoomCode, clue });
            clueInput.value = '';
            clueInputContainer.style.display = 'none';
        }
    });
    
    submitGuessBtn.addEventListener('click', () => {
        const guess = impostorGuessInput.value.trim();
        if(guess){
            socket.emit('impostorGuess', { roomCode: currentRoomCode, guess });
        }
    });

    playAgainBtn.addEventListener('click', () => {
        socket.emit('playAgain', currentRoomCode);
    });


    // Handlers de Eventos do Socket.IO
    socket.on('roomCreated', ({ roomCode, players }) => {
        currentRoomCode = roomCode;
        roomCodeDisplay.textContent = roomCode;
        updatePlayerList(players);
        switchScreen('lobby');
        startGameBtn.style.display = 'block';
    });

    socket.on('updatePlayerList', (players) => {
        updatePlayerList(players);
        if (isHost && players.length >= 3) {
            startGameBtn.disabled = false;
        } else if (isHost) {
            startGameBtn.disabled = true;
        }
        if(!isHost) startGameBtn.style.display = 'none';
    });
    
    socket.on('error', (message) => {
        homeError.textContent = message;
    });

    socket.on('gameStarted', ({ role, word, theme }) => {
        clueList.innerHTML = '';
        if (role === 'impostor') {
            roleInfo.style.display = 'none';
            themeInfo.style.display = 'block';
            themeDisplay.textContent = theme;
        } else {
            roleInfo.style.display = 'block';
            themeInfo.style.display = 'none';
            wordDisplay.textContent = word;
        }
        clueInputContainer.style.display = 'none';
        switchScreen('game');
    });

    socket.on('nextTurn', (playerName) => {
        turnInfo.textContent = `É a vez de ${playerName} dar a dica.`;
        if (playerName === playerNameInput.value.trim()) {
            clueInputContainer.style.display = 'block';
            turnInfo.textContent = 'É a sua vez! Dê uma dica.';
        } else {
            clueInputContainer.style.display = 'none';
        }
    });

    socket.on('newClue', ({ playerName, clue }) => {
        const li = document.createElement('li');
        li.textContent = `${playerName}: ${clue}`;
        clueList.appendChild(li);
    });
    
    socket.on('startVoting', (players) => {
        turnInfo.textContent = "Todas as dicas foram dadas!";
        setTimeout(() => {
            votingButtons.innerHTML = '';
            players.forEach(player => {
                if(player.id !== socket.id) { // Não pode votar em si mesmo
                    const btn = document.createElement('button');
                    btn.textContent = `Votar em ${player.name}`;
                    btn.onclick = () => {
                        socket.emit('submitVote', { roomCode: currentRoomCode, votedPlayerId: player.id });
                        votingButtons.innerHTML = '<p>Aguardando os outros jogadores...</p>';
                    };
                    votingButtons.appendChild(btn);
                }
            });
            switchScreen('voting');
        }, 2000); // Pequeno delay para ler a última dica
    });

    socket.on('votingResult', ({ mostVotedPlayerName, isImpostor, impostorName }) => {
        switchScreen('end');
        impostorGuessBox.style.display = 'none';
        playAgainBtn.style.display = 'none';
        
        let subTitleText = `Vocês votaram em ${mostVotedPlayerName}. `;
        if(isImpostor) {
            subTitleText += `E vocês acertaram!`;
        } else {
            subTitleText += `Mas o impostor era ${impostorName}!`;
        }
        endSubtitle.textContent = subTitleText;
    });
    
    socket.on('impostorGuessChance', () => {
        impostorGuessBox.style.display = 'block';
    });

    socket.on('finalResult', ({ impostorName, secretWord, clues, impostorWon, impostorGuess, impostorWinsByGuess }) => {
        impostorGuessBox.style.display = 'none';
        impostorWas.textContent = impostorName;
        secretWordWas.textContent = secretWord;
        
        finalCluesList.innerHTML = '';
        clues.forEach(item => {
            const player = playerList.querySelector(`li:contains("${item.player}")`)?.textContent || item.player;
            const li = document.createElement('li');
            // Precisa de uma lógica mais robusta para mapear ID para nome aqui
            li.textContent = `${item.clue}`;
            finalCluesList.appendChild(li);
        });

        if (impostorWon) {
            endTitle.textContent = "O IMPOSTOR VENCEU!";
            endSubtitle.textContent = "A maioria votou na pessoa errada.";
        } else if (impostorWinsByGuess) {
            endTitle.textContent = "VITÓRIA ROUBADA!";
            endSubtitle.textContent = `O impostor adivinhou a palavra secreta "${impostorGuess}" e venceu!`;
        } else if (impostorWinsByGuess === false) {
             endTitle.textContent = "OS JOGADORES VENCERAM!";
             endSubtitle.textContent = `O impostor errou o palpite final. Adivinhou "${impostorGuess}".`;
        } else {
            endTitle.textContent = "OS JOGADORES VENCERAM!";
        }
        
        if (isHost) {
            playAgainBtn.style.display = 'block';
        } else {
            playAgainBtn.textContent = 'Aguardando o host iniciar novamente...';
            playAgainBtn.style.display = 'block';
            playAgainBtn.disabled = true;
        }
        switchScreen('end');
    });

    socket.on('resetToLobby', (players) => {
        updatePlayerList(players);
        switchScreen('lobby');
    });

    socket.on('gameAborted', (message) => {
        alert(message);
        switchScreen('lobby');
    });
});