// Importa as bibliotecas necessárias
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Lista de palavras e seus temas. Adicione mais para diversificar o jogo!
const wordList = [
    { word: "Telescópio", theme: "Objeto Científico" },
    { word: "Elefante", theme: "Animal" },
    { word: "Pizza", theme: "Comida" },
    { word: "Bicicleta", theme: "Veículo" },
    { word: "Guitarra", theme: "Instrumento Musical" },
    { word: "Marte", theme: "Planeta" },
    { word: "Chocolate", theme: "Doce" },
    { word: "Enfermeira", theme: "Profissão" },
    { word: "Futebol", theme: "Esporte" },
    { word: "Matrix", theme: "Filme" },
];

// Armazena o estado de todas as salas de jogo
const rooms = {};

// Serve os arquivos estáticos da pasta 'public' (HTML, CSS, JS do cliente)
app.use(express.static('public'));

// Evento disparado quando um novo cliente se conecta
io.on('connection', (socket) => {
    console.log(`Novo jogador conectado: ${socket.id}`);

    // Cria uma nova sala
    socket.on('createRoom', (playerName) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(roomCode);
        rooms[roomCode] = {
            host: socket.id,
            players: [{ id: socket.id, name: playerName, score: 0 }],
            gameState: 'waiting',
        };
        socket.emit('roomCreated', { roomCode, players: rooms[roomCode].players });
    });

    // Entra em uma sala existente
    socket.on('joinRoom', ({ roomCode, playerName }) => {
        if (rooms[roomCode]) {
            socket.join(roomCode);
            rooms[roomCode].players.push({ id: socket.id, name: playerName, score: 0 });
            io.to(roomCode).emit('updatePlayerList', rooms[roomCode].players);
        } else {
            socket.emit('error', 'Sala não encontrada.');
        }
    });

    // Inicia o jogo (somente o host pode fazer isso)
    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.host === socket.id && room.players.length >= 3) { // Mínimo de 3 jogadores
            startGameRound(roomCode);
        }
    });

    // Recebe a dica de um jogador
    socket.on('submitClue', ({ roomCode, clue }) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'giving_clues') {
            room.clues.push({ player: socket.id, clue: clue });
            io.to(roomCode).emit('newClue', { playerName: room.players.find(p => p.id === socket.id).name, clue });

            // Passa para o próximo jogador ou inicia a votação
            room.currentPlayerIndex++;
            if (room.currentPlayerIndex < room.turnOrder.length) {
                const nextPlayerId = room.turnOrder[room.currentPlayerIndex];
                io.to(roomCode).emit('nextTurn', room.players.find(p => p.id === nextPlayerId).name);
            } else {
                room.gameState = 'voting';
                io.to(roomCode).emit('startVoting', room.players);
            }
        }
    });
    
    // Recebe o voto de um jogador
    socket.on('submitVote', ({ roomCode, votedPlayerId }) => {
        const room = rooms[roomCode];
        if (room && room.gameState === 'voting') {
            room.votes[socket.id] = votedPlayerId;

            // Se todos votaram, computa o resultado
            if (Object.keys(room.votes).length === room.players.length) {
                endRound(roomCode);
            }
        }
    });

    // Recebe o palpite final do impostor
    socket.on('impostorGuess', ({ roomCode, guess }) => {
        const room = rooms[roomCode];
        const impostor = room.players.find(p => p.id === room.impostor);
        const secretWord = room.word.word.toLowerCase();
        let impostorWins = false;

        if(guess.toLowerCase().trim() === secretWord) {
            impostorWins = true;
        }

        io.to(roomCode).emit('finalResult', {
            impostorName: impostor.name,
            secretWord: room.word.word,
            clues: room.clues,
            impostorGuess: guess,
            impostorWinsByGuess: impostorWins
        });
        room.gameState = 'ended';
    });

    // Jogar novamente
    socket.on('playAgain', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.host === socket.id) {
            room.gameState = 'waiting';
            // Reseta o estado do jogo, mas mantém jogadores e scores
            delete room.word;
            delete room.impostor;
            delete room.clues;
            delete room.votes;
            delete room.turnOrder;
            delete room.currentPlayerIndex;
            io.to(roomCode).emit('resetToLobby', room.players);
        }
    });
    
    // Lida com a desconexão de um jogador
    socket.on('disconnect', () => {
        console.log(`Jogador desconectado: ${socket.id}`);
        // Encontra a sala em que o jogador estava e o remove
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                // Se a sala ficar vazia, ela é excluída
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                } else {
                    // Se o host se desconectou, elege um novo host
                    if (room.host === socket.id) {
                        room.host = room.players[0].id;
                    }
                    // Se o jogo estava em andamento, encerra
                    if(room.gameState !== 'waiting') {
                        io.to(roomCode).emit('gameAborted', 'O jogo foi encerrado porque um jogador saiu.');
                        room.gameState = 'waiting';
                    }
                    io.to(roomCode).emit('updatePlayerList', room.players);
                }
                break;
            }
        }
    });
});

function startGameRound(roomCode) {
    const room = rooms[roomCode];
    room.gameState = 'giving_clues';

    // 1. Escolhe uma palavra e um impostor
    room.word = wordList[Math.floor(Math.random() * wordList.length)];
    const impostorIndex = Math.floor(Math.random() * room.players.length);
    room.impostor = room.players[impostorIndex].id;
    
    // Inicializa estruturas da rodada
    room.clues = [];
    room.votes = {};
    
    // Define a ordem dos turnos aleatoriamente
    room.turnOrder = room.players.map(p => p.id).sort(() => Math.random() - 0.5);
    room.currentPlayerIndex = 0;

    // 2. Envia a palavra/tema para cada jogador
    room.players.forEach(player => {
        if (player.id === room.impostor) {
            io.to(player.id).emit('gameStarted', { role: 'impostor', theme: room.word.theme });
        } else {
            io.to(player.id).emit('gameStarted', { role: 'player', word: room.word.word });
        }
    });
    
    // 3. Informa de quem é a vez
    const firstPlayerId = room.turnOrder[room.currentPlayerIndex];
    io.to(roomCode).emit('nextTurn', room.players.find(p => p.id === firstPlayerId).name);
}

function endRound(roomCode) {
    const room = rooms[roomCode];
    room.gameState = 'ended';

    // Conta os votos
    const voteCounts = {};
    Object.values(room.votes).forEach(votedId => {
        voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
    });

    // Encontra o jogador mais votado
    let mostVotedPlayerId = null;
    let maxVotes = 0;
    for (const playerId in voteCounts) {
        if (voteCounts[playerId] > maxVotes) {
            maxVotes = voteCounts[playerId];
            mostVotedPlayerId = playerId;
        }
    }

    const impostor = room.players.find(p => p.id === room.impostor);
    const mostVotedPlayer = room.players.find(p => p.id === mostVotedPlayerId);
    
    const majorityVotedCorrectly = mostVotedPlayerId === room.impostor;

    io.to(roomCode).emit('votingResult', {
        votes: room.votes,
        players: room.players,
        mostVotedPlayerName: mostVotedPlayer.name,
        isImpostor: majorityVotedCorrectly,
        impostorName: impostor.name
    });

    if (!majorityVotedCorrectly) {
        // Se a maioria errou, o impostor ganha imediatamente.
        io.to(roomCode).emit('finalResult', {
            impostorName: impostor.name,
            secretWord: room.word.word,
            clues: room.clues,
            impostorWon: true
        });
    } else {
        // Se a maioria acertou, o impostor tem a chance de adivinhar.
        io.to(room.impostor).emit('impostorGuessChance');
    }
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
