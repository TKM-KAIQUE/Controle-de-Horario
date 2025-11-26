// server.js

// ----------------------------------------------------------------
// 1. IMPORTAÇÕES E CONFIGURAÇÃO BASE
// ----------------------------------------------------------------
import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------------------
// 2. CONFIGURAÇÃO DO BANCO DE DADOS (PostgreSQL)
// ----------------------------------------------------------------
const pool = new Pool({
  user: 'seu_usuario_db',          // ⚠️ Mude para o seu usuário
  host: 'localhost',
  database: 'seu_banco_db',        // ⚠️ Mude para o seu banco
  password: 'sua_senha_db',        // ⚠️ Mude para sua senha
  port: 5432,
});

// Helper de log de erros
const logError = (err, rota) => {
  console.error(`[${new Date().toISOString()}] Erro na rota ${rota}:`, err.message);
  if (err.code) {
    console.error(`\tCódigo do Erro PG: ${err.code}`);
  }
};

// ----------------------------------------------------------------
// 3. MIDDLEWARES (Configurações Globais do Express)
// ----------------------------------------------------------------
app.use(cors());
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições

// Basic route for testing
app.get('/', (req, res) => {
  res.send('🚀 O servidor está funcionando!');
});

// ----------------------------------------------------------------
// 🏛️ API DE RECURSOS (Tabela: recursos)
// ----------------------------------------------------------------

// [POST] /recursos - Criar um novo recurso
app.post('/recursos', async (req, res) => {
  const { nome, descricao } = req.body;

  if (!nome || !descricao) {
    return res.status(400).json({ error: 'Nome e descrição são obrigatórios.' });
  }

  try {
    const query = 'INSERT INTO recursos (nome, descricao) VALUES ($1, $2) RETURNING *';
    const result = await pool.query(query, [nome, descricao]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logError(err, 'POST /recursos');
    res.status(500).json({ error: 'Erro ao criar recurso.' });
  }
});

// [GET] /recursos - Listar todos os recursos
app.get('/recursos', async (req, res) => {
  try {
    const query = 'SELECT * FROM recursos ORDER BY nome ASC';
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (err) {
    logError(err, 'GET /recursos');
    res.status(500).json({ error: 'Erro ao buscar recursos.' });
  }
});

// [GET] /recursos/:id - Obter um recurso específico
app.get('/recursos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const query = 'SELECT * FROM recursos WHERE id = $1';
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Recurso não encontrado.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    logError(err, 'GET /recursos/:id');
    res.status(500).json({ error: 'Erro ao buscar recurso.' });
  }
});

// [PUT] /recursos/:id - Atualizar um recurso
app.put('/recursos/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, descricao } = req.body;

  if (!nome || !descricao) {
    return res.status(400).json({ error: 'Nome e descrição são obrigatórios.' });
  }

  try {
    const query = 'UPDATE recursos SET nome = $1, descricao = $2 WHERE id = $3 RETURNING *';
    const result = await pool.query(query, [nome, descricao, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Recurso não encontrado para atualização.' });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    logError(err, 'PUT /recursos/:id');
    res.status(500).json({ error: 'Erro ao atualizar recurso.' });
  }
});

// [DELETE] /recursos/:id - Deletar um recurso
app.delete('/recursos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const query = 'DELETE FROM recursos WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Recurso não encontrado para deletar.' });
    }
    res.status(204).send();
  } catch (err) {
    logError(err, 'DELETE /recursos/:id');
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Não é possível deletar. Recurso está em uso por agendamentos.' });
    }
    res.status(500).json({ error: 'Erro ao deletar recurso.' });
  }
});

// ----------------------------------------------------------------
// 🗓️ API DE AGENDAMENTOS (Tabela: agendamentos)
// ----------------------------------------------------------------

app.post('/agendamentos', async (req, res) => {
  const { professor, turma, data_reserva, horario_reserva, id_recurso } = req.body;
  const data_criacao = Date.now();

  if (!professor || !turma || !data_reserva || !horario_reserva || !id_recurso) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  try {
    const query = `
      INSERT INTO agendamentos 
      (professor, turma, data_reserva, horario_reserva, id_recurso, data_criacao) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `;
    const params = [professor, turma, data_reserva, horario_reserva, id_recurso, data_criacao];
    const result = await pool.query(query, params);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logError(err, 'POST /agendamentos');

    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflito: Já existe um agendamento para este recurso neste horário.' });
    }
    if (err.code === '23503') {
      return res.status(409).json({ error: 'Recurso especificado (id_recurso) não existe.' });
    }
    res.status(500).json({ error: 'Erro ao criar agendamento.' });
  }
});

// ----------------------------------------------------------------
// ⛔ API DE BLOQUEIOS (Tabela: bloqueio)
// ----------------------------------------------------------------

app.post('/bloqueios', async (req, res) => {
  const { nome, data, tipo, valido_para_todos } = req.body;
  const data_criacao = Date.now();

  if (!nome || !data || !tipo || valido_para_todos === undefined) {
    return res.status(400).json({ error: 'Nome, data, tipo e valido_para_todos são obrigatórios.' });
  }

  try {
    const query = `
      INSERT INTO bloqueio (nome, data, tipo, valido_para_todos, data_criacao) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
    const params = [nome, data, tipo, valido_para_todos, data_criacao];
    const result = await pool.query(query, params);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logError(err, 'POST /bloqueios');
    res.status(500).json({ error: 'Erro ao criar bloqueio.' });
  }
});

// ----------------------------------------------------------------
// 5. INICIAR O SERVIDOR
// ----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
