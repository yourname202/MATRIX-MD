require("dotenv").config()
const fs = require("fs")
const path = require("path")
const readline = require("readline")
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys")
const pino = require("pino")

// -------- Variables depuis .env --------
const OWNER = process.env.OWNER_NUMBER
const BOT_NAME = process.env.BOT_NAME || "MATRIX-MD"
const OPENAI_KEY = process.env.OPENAI_API_KEY
const WELCOME_MESSAGE = process.env.WELCOME_MESSAGE || "Bienvenue !"
const GOODBYE_MESSAGE = process.env.GOODBYE_MESSAGE || "Au revoir !"
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "."

// -------- Charger les plugins --------
const plugins = {}
const pluginFolders = [
  "system","admin","owner","image","game","ai","fun","textmaker","download","insu_compl"
]

pluginFolders.forEach(folder => {
  const folderPath = path.join(__dirname, "plugins", folder)
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach(file => {
      const plugin = require(`./plugins/${folder}/${file}`)
      if (plugin && plugin.command && plugin.run) plugins[plugin.command] = plugin.run
    })
  }
})

// -------- Créer dossier session --------
if (!fs.existsSync("./session")) fs.mkdirSync("./session")

// -------- Fonction principale --------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    printQRInTerminal: false
  })

  sock.ev.on("creds.update", saveCreds)

  // -------- Pairing code si pas encore connecté --------
  if (!state.creds.registered) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question("📱 Entre ton numéro WhatsApp (ex: 243xxxxxxxx): ", async (number) => {
      try {
        const pairingCode = await sock.requestPairingCode(number)
        console.log("🔑 Ton code de jumelage :", pairingCode)
        console.log("🔔 Va sur WhatsApp → Appareils connectés → Lier un appareil → Entrer ce code")
      } catch (err) {
        console.log("❌ Erreur génération code :", err)
      }
      rl.close()
    })
  }

  console.log(`🤖 ${BOT_NAME} prêt !`)

  // -------- Photo de profil automatique (optionnel) --------
  const profilePath = "./assets/profile.jpg"
  if (fs.existsSync(profilePath)) {
    try {
      await sock.updateProfilePicture(OWNER, { url: profilePath })
      console.log("✅ Photo de profil mise à jour !")
    } catch {}
  }

  // -------- Écoute des messages --------
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text
    if (!text) return

    const args = text.trim().split(" ")
    const cmdName = args[0].replace(COMMAND_PREFIX, "").toLowerCase()

    // Récupérer participants si nécessaire
    let participants = []
    if (["tagall","kickall"].includes(cmdName)) {
      try {
        const group = await sock.groupMetadata(msg.key.remoteJid)
        participants = group.participants.map(p => p.id)
      } catch {}
    }

    // Exécuter commande
    if (plugins[cmdName]) {
      try {
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
