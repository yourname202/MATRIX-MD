require("dotenv").config()

const OWNER = process.env.OWNER_NUMBER
const BOT_NAME = process.env.BOT_NAME
const OPENAI_KEY = process.env.OPENAI_API_KEY
const WELCOME_MESSAGE = process.env.WELCOME_MESSAGE
const GOODBYE_MESSAGE = process.env.GOODBYE_MESSAGE
const COMMANDE_PREFIX =process.env.COMMANDE_PREFIX
const fs = require("fs")
const path = require("path")
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const pino = require("pino")

// -------- Charger les plugins dynamiquement --------
const plugins = {}
const pluginFolders = [
  "system", "admin", "owner", "image",
  "game", "ai", "fun", "textmaker",
  "download", "insu_compl"
]

pluginFolders.forEach(folder => {
  const folderPath = path.join(__dirname, "plugins", folder)
  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath)
    files.forEach(file => {
      const plugin = require(`./plugins/${folder}/${file}`)
      if (plugin && plugin.command && plugin.run) {
        plugins[plugin.command] = plugin.run
      }
    })
  }
})

// -------- Fonction principale --------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state
  })

  sock.ev.on("creds.update", saveCreds)

  console.log("🤖 Bot MATRIX-MD prêt !")

  // -------- Écoute des messages --------
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text
    if (!text) return

    // Récupérer les participants si besoin pour certaines commandes
    const participants = msg.message?.key?.participants || []

    // Parser commande (suppose que toutes les commandes commencent par '.')
    const args = text.trim().split(" ")
    const cmdName = args[0].replace(".", "").toLowerCase() // enleve le . et passe en minuscule

    // Vérifie si la commande existe
    if (plugins[cmdName]) {
      try {
        // Passe sock, msg, arguments supplémentaires, participants
        await plugins[cmdName](sock, msg, ...args.slice(1), participants)
      } catch (err) {
        console.log(`Erreur commande ${cmdName}:`, err)
        await sock.sendMessage(msg.key.remoteJid, { text: `❌ Erreur lors de l'exécution de la commande ${cmdName}` })
      }
    }
  })
}

// -------- Démarrer le bot --------
startBot()
