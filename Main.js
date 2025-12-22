require("dotenv").config()
const fs = require("fs")
const path = require("path")
const qrcode = require("qrcode-terminal")
const pino = require("pino")

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys")

// -------- ENV --------
const OWNER = process.env.OWNER_NUMBER || ""
const BOT_NAME = process.env.BOT_NAME || "MATRIX-MD"
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "."

// ⚠️ NUMÉRO POUR PAIRING (format international sans +)
const PAIRING_NUMBER = process.env.PAIRING_NUMBER || "" // ex: 243xxxxxxxxx

// -------- Plugins --------
const plugins = {}
const pluginFolders = [
  "system","admin","owner","image","game","ai","fun","textmaker","download","insu_compl"
]

for (const folder of pluginFolders) {
  const folderPath = path.join(__dirname, "plugins", folder)
  if (!fs.existsSync(folderPath)) continue

  for (const file of fs.readdirSync(folderPath)) {
    if (!file.endsWith(".js")) continue
    const plugin = require(`./plugins/${folder}/${file}`)
    if (plugin?.command && typeof plugin.run === "function") {
      plugins[plugin.command.toLowerCase()] = plugin.run
    }
  }
}

// -------- Session --------
const SESSION_DIR = "./session"
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR)

// -------- Start Bot --------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    version,
    printQRInTerminal: false
  })

  sock.ev.on("creds.update", saveCreds)

  // -------- Pairing Code (si pas encore connecté) --------
  if (!state.creds.registered && PAIRING_NUMBER) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(PAIRING_NUMBER)
        console.log("\n🔐 CODE DE PAIRING WHATSAPP")
        console.log("👉", code)
        console.log("📱 WhatsApp > Appareils liés > Lier avec un numéro\n")
      } catch (err) {
        console.error("❌ Erreur Pairing Code :", err)
      }
    }, 3000)
  }

  // -------- Connection Update --------
  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update

    // QR Code
    if (qr) {
      console.log("\n📱 Scanne ce QR Code avec WhatsApp\n")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log(`\n✅ ${BOT_NAME} connecté avec succès !`)

      if (OWNER) {
        sock.sendMessage(OWNER, {
          text: `🤖 ${BOT_NAME} est maintenant en ligne.\nTape .menu`
        }).catch(() => {})
      }
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode
      console.log("❌ Connexion fermée :", reason)

      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔄 Reconnexion...")
        startBot()
      }
    }
  })

  // -------- Messages --------
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return

    const msg = messages[0]
    if (!msg?.message) return

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""

    if (!text.startsWith(COMMAND_PREFIX)) return

    const args = text.slice(COMMAND_PREFIX.length).trim().split(/\s+/)
    const cmdName = args.shift().toLowerCase()

    let participants = []
    if (["tagall", "kickall"].includes(cmdName)) {
      try {
        const group = await sock.groupMetadata(msg.key.remoteJid)
        participants = group.participants.map(p => p.id)
      } catch {}
    }

    if (plugins[cmdName]) {
      try {
        await plugins[cmdName](sock, msg, args, participants)
      } catch (err) {
        console.error("❌ Erreur commande :", err)
        await sock.sendMessage(msg.key.remoteJid, {
          text: "❌ Erreur lors de l’exécution de la commande"
        })
      }
    }
  })
}

// -------- Lancer --------
startBot()        
