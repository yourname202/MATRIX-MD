require("dotenv").config()
const fs = require("fs")
const path = require("path")
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys")
const pino = require("pino")

// -------- Variables .env --------
const OWNER = process.env.OWNER_NUMBER || ""
const BOT_NAME = process.env.BOT_NAME || "MATRIX-MD"
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "."

// -------- Charger les plugins --------
const plugins = {}
const pluginFolders = [
  "system","admin","owner","image","game","ai","fun","textmaker","download","insu_compl"
]

for (const folder of pluginFolders) {
  const folderPath = path.join(__dirname, "plugins", folder)
  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath)
    for (const file of files) {
      if (!file.endsWith(".js")) continue
      const plugin = require(`./plugins/${folder}/${file}`)
      if (plugin?.command && typeof plugin.run === "function") {
        plugins[plugin.command.toLowerCase()] = plugin.run
      }
    }
  }
}

// -------- Créer dossier session --------
if (!fs.existsSync("./session")) {
  fs.mkdirSync("./session")
}

// -------- Fonction principale --------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")

  // ⚠️ CORRECTION ICI (pas de destructuring)
  const versionData = await fetchLatestBaileysVersion()
  const version = versionData.version || versionData

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    version,
    printQRInTerminal: true // ✅ QR CODE
  })

  sock.ev.on("creds.update", saveCreds)

  console.log(`🤖 ${BOT_NAME} lancé`)
  console.log("📱 Scanne le QR code avec WhatsApp → Appareils connectés")

  // -------- Écoute des messages --------
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg?.message) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text || !text.startsWith(COMMAND_PREFIX)) return

    const args = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/)
    const cmdName = args.shift().toLowerCase()

    // Récupérer les participants pour certaines commandes
    let participants = []
    if (["tagall", "kickall"].includes(cmdName)) {
      try {
        const group = await sock.groupMetadata(msg.key.remoteJid)
        participants = group.participants.map(p => p.id)
      } catch (e) {
        console.log("⚠️ Impossible de récupérer les participants")
      }
    }

    // Exécuter la commande
    if (plugins[cmdName]) {
      try {
        await plugins[cmdName](sock, msg, args, participants)
      } catch (err) {
        console.log(`❌ Erreur commande ${cmdName}`, err)
        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Erreur lors de l'exécution de la commande"
        })
      }
    }
  })
}

// -------- Lancer le bot --------
startBot().catch(err => {
  console.log("❌ Erreur démarrage bot :", err)
})
