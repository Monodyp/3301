export const conversations = [
  { id: 1, name: 'Mara', preview: 'Did you get the package?', time: '11:42', unread: 2, color: '#c5a8ff' },
  { id: 2, name: 'Theo Park', preview: 'The server key changed again.', time: '10:18', unread: 0, color: '#80c7a4' },
  { id: 3, name: 'Lena', preview: 'Call me when you are home.', time: 'Yesterday', unread: 0, color: '#df9d9d' },
]

export const chatMessages = [
  { from: 'them', text: 'Hey. Are you still awake?', time: '11:39' },
  { from: 'me', text: 'Just got back. What happened?', time: '11:40' },
  { from: 'them', text: 'Did you get the package?', time: '11:42' },
]

export const socialPosts = [
  { id: 1, user: 'theo.p', handle: '@theopark', text: 'Late train. Strange message in the maintenance logs. Nothing I can post yet.', time: '18m', likes: 24, comments: 5, color: '#7aa6c9' },
  { id: 2, user: 'Mara Vale', handle: '@maravale', text: 'Found the old observatory schedule. Some of these dates are circled three times.', time: '1h', likes: 81, comments: 12, color: '#a993ce' },
  { id: 3, user: 'Northbridge Community', handle: '@northbridge', text: 'Utility outage reported near the east transit corridor. Crews are on site.', time: '3h', likes: 9, comments: 3, color: '#789b8a' },
]

export const emails = [
  { id: 1, sender: 'Northbridge Transit', subject: 'Route closure notice', preview: 'A section of Line 4 will remain closed overnight...', time: '10:06', unread: true },
  { id: 2, sender: 'M. Rowan', subject: 'Package collection', preview: 'It is under the name Avery. Do not open it near cameras.', time: '09:31', unread: true },
  { id: 3, sender: 'Atlas Cloud', subject: 'Security sign-in', preview: 'A new sign-in was detected from this device.', time: 'Yesterday', unread: false },
]
