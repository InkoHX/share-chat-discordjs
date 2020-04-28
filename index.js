const Discord = require('discord.js')
const DeepProxy = require('proxy-deep')
const fs = require('fs/promises')
const mkdirp = require('mkdirp')
const { dirname } = require('path')
const client = new Discord.Client()

/**
 * data store
 * @param {string} path
 * @param {object} _default
 *
 * @see {@link https://scrapbox.io/discordjs-japan/更新したら自動で保存されるオブジェクトのサンプル|Scrapbox}
 */
const dataStore = async (path, _default = {}) => {
  const data = await fs
    .readFile(path)
    .then(file => JSON.parse(file))
    .catch(async () => {
      await mkdirp(dirname(path))
      await fs.writeFile(path, JSON.stringify(_default, null, 2))
      return _default
    })

  return new DeepProxy(data, {
    get (target, key, receiver) {
      const val = Reflect.get(target, key, receiver)
      if (typeof val === 'object' && val !== null) {
        return this.nest(val)
      } else {
        return val
      }
    },
    set (target, key, value, receiver) {
      Reflect.set(target, key, value, receiver)
      fs.writeFile(path, JSON.stringify(this.rootTarget, null, 2))
      return true
    }
  })
}

/**
 * @type {Promise<{ channels: string[]}>}
 */
const storeAsync = dataStore('./data.json', { channels: [] })

client.once('ready', () => {
  console.log('Ready!')
})

client.on('message', message => {
  if (message.author.bot || message.system) return
  if (message.guild && !message.guild.available) return

  if (message.content.startsWith('!setShareChannel')) return setShareChannel(message)
  if (message.content.startsWith('!deleteShareChannel')) return deleteShareChannel(message)

  return handleMessage(message)
})

/**
 * handle Messages
 * @param {Discord.Message} message
 *
 * @returns {Promise<Discord.Message[]>}
 */
async function handleMessage (message) {
  const store = await storeAsync.then(value => value.channels)

  if (!store.find(value => value === message.channel.id)) return

  await message.delete()

  return Promise.all(store.map(value => client.channels.fetch(value)))
    .then(channels => channels.filter(channel => channel.type === 'text'))
    .then(channels => Promise.all(channels.map(channel => channel.send(message.content || 'メッセージ無し', message.attachments.array()))))
}

/**
 * !deleteShareChannel <channels>
 * @param {Discord.Message} message
 *
 * @returns {Promise<Discord.Message>}
 */
async function deleteShareChannel (message) {
  const member = message.member

  if (!member.hasPermission('MANAGE_GUILD')) return message.reply('**サーバーの管理権限**があるユーザーのみ使用できます。')

  const channels = message.mentions.channels.array()

  if (!channels.length) return message.reply('解除する共有チャンネルをメンションして送信してね。')

  const channelIds = channels.map(channel => channel.id)
  const store = await storeAsync

  store.channels = store.channels
    .filter(value => !channelIds.includes(value))

  return message.reply(`${channels.join(', ')} の共有を解除しました。`)
}

/**
 * !setShareChannel <channels>
 * @param {Discord.Message} message
 *
 * @returns {Promise<Discord.Message>}
 */
async function setShareChannel (message) {
  const member = message.member

  if (!member.hasPermission('MANAGE_GUILD')) return message.reply('**サーバーの管理権限**があるユーザーのみ使用できます。')

  const channels = message.mentions.channels.array()

  if (!channels.length) return message.reply('共有するチャンネルをメンションして送信してね。')

  /**
   * @type {Discord.TextChannel[]}
   */
  const result = []
  const store = await storeAsync.then(value => value.channels)

  for (const channel of channels) {
    if (store.find(value => value === channel.id)) continue
    const missingPermissions = channel.permissionsFor(message.guild.me).missing(['SEND_MESSAGES', 'VIEW_CHANNEL', 'ATTACH_FILES'])
    if (missingPermissions.length) return message.reply(`権限が不足しているよ、${channel}を登録するには**${missingPermissions.join(', ')}**をボットに与えてね。`)

    store.push(channel.id)
    result.push(channel)
  }

  if (!result.length) return message.reply('既に登録されているよ。')

  return message.reply(`${result.join(', ')} を共有チャンネルとして登録したよ。`)
}

client.login()
  .catch(console.error)
