# Meister 🚀

Aplicativo de gestão financeira com auxílio a MEI.

---

## 🛠️ Tecnologias Utilizadas (Até o momento)

- **Node.js**
- **Fastify**
- **Prisma ORM**
- **PostgreSQL**

---

### 📌 Rotas Disponíveis

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/register` | Registo de novo utilizador |
| `POST` | `/api/login` | Autenticação e emissão de token JWT |

---

## ⚙️ Configuração do Ambiente

1. **Clone o repositório:**
   ```
   git clone https://github.com/jacaze/Meister.git
   cd Meister
   ```

2. **Instale as dependências:**
   ```
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   ```
   Renomeie o .env.example para .env e ajuste url do banco de dados, chave do JWT, e tempo de bloqueio caso erre a senha
   DATABASE_URL="postgresql://usuario:senha@localhost:5432/meister_db?schema=public"
   JWT_SECRET="sua_chave_secreta_aqui"
   LOCK_TIME_MINUTES=5
   ```
   
4. **Execute as migrações do banco de dados:**
  ```
  npx prisma migrate dev
  ```

5. **Inicie o servidor de desenvolvimento:**
   ```
   node .\backend\src\server.js
   ```
