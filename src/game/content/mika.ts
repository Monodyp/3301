// Character 01, Mika: Aspiring Streamer.
// Source: GDD Stage 5, Batch 1 (complete narrative scripts) and the Character Bible.
// All names, accounts, domains and amounts are fictional.
//
// Choices are listed in script order (A, B, C, D) but the engine shuffles them
// per player, so the letter a choice had in the script never shows in the game.

import type { Character } from '../types.ts'

export const mika: Character = {
  id: 'mika',
  number: 1,
  name: 'Mika',
  archetype: 'Aspiring Streamer',
  occupation: 'University student and streamer',
  goal: 'Reach her first 1,000 followers and attract a small sponsor.',
  background:
    'Mika streams games and posts short clips. Her audience is small but growing, and she wants to turn her hobby into something meaningful, and maybe profitable.',
  objective: 'Grow to 1,000 followers and land a real sponsor.',
  apps: ['messages', 'social', 'email', 'browser', 'contacts', 'calls', 'wallet', 'settings'],
  startingBalance: 3200,
  encounters: [
    // ------------------------------------------------------------ A1
    {
      id: 'MK-A1',
      characterId: 'mika',
      archetype: 'A1',
      category: 'awareness',
      title: 'Dedicated Viewer',
      lesson: 'Recognizing gradual trust-building and manipulation.',
      trigger: {
        app: 'messages',
        sender: 'StarWatcher',
        title: 'New follower: StarWatcher',
        message: "Hey! Just wanted to say I really enjoyed your stream. You're seriously underrated.",
      },
      advertisement: {
        id: 'MK-A1-ad',
        title: 'Verified Growth Tools',
        description: 'A stream software preview. Check the seller and destination before opening it.',
        destination: 'growth.example/preview',
        suspicious: true,
        encounterId: 'MK-A1',
      },
      thread: [
        { from: 'them', sender: 'StarWatcher', text: "I've been watching for a while. You deserve a much bigger audience.", time: 'Day 1' },
        { from: 'them', sender: 'StarWatcher', text: "You have a really good personality on stream. It's refreshing.", time: 'Day 1' },
        { from: 'me', text: 'Aww, thank you! I appreciate it.', time: 'Day 1' },
        { from: 'them', sender: 'StarWatcher', text: "I noticed you were streaming late again. Don't overwork yourself.", time: 'Day 3' },
        { from: 'me', text: 'Haha, I probably should sleep earlier.', time: 'Day 3' },
        { from: 'them', sender: 'StarWatcher', text: 'I just want to see you succeed. You can trust me.', time: 'Day 3' },
        { from: 'them', sender: 'StarWatcher', text: 'I think I can help you get more exposure. I know people who can promote your channel.', time: 'Day 6' },
        { from: 'me', text: 'Really? How?', time: 'Day 6' },
        { from: 'them', sender: 'StarWatcher', text: "Let's move somewhere private. I don't want other people interfering.", time: 'Day 6' },
      ],
      artifacts: [
        { id: 'MK-A1-ART-01', label: 'Message history', app: 'messages', detail: 'The contact repeatedly gives compliments and offers emotional support.', isKeyEvidence: true },
        { id: 'MK-A1-ART-02', label: 'Account profile', app: 'social', detail: 'The account has limited history and no creator affiliation you can verify.', isKeyEvidence: true },
        { id: 'MK-A1-ART-03', label: 'Conversation timeline', app: 'messages', detail: 'Over six days the chat shifts from ordinary talk toward private contact and influence.', isKeyEvidence: true },
      ],
      prompt: 'What should Mika do?',
      choices: [
        {
          id: 'MK-A1-c1',
          text: 'Continue the conversation and move to the private platform because the person has been supportive.',
          isCorrect: false,
          outcome: 'Mika becomes more exposed to manipulation.',
          consequence: { kind: 'pressure', message: "StarWatcher: Good. Now it's just us. Don't tell anyone about this, okay?" },
        },
        {
          id: 'MK-A1-c2',
          text: 'Keep boundaries, avoid sharing private information, and verify any professional claims independently.',
          isCorrect: true,
          outcome: 'Mika stays in control and can judge the offer safely.',
          consequence: { kind: 'none' },
        },
        {
          id: 'MK-A1-c3',
          text: 'Give the contact access to her creator account right away so they can help promote it.',
          isCorrect: false,
          outcome: 'Her creator account is at serious risk of takeover.',
          consequence: { kind: 'account_compromise', amount: 25, message: 'New sign-in to your creator account from an unknown device.' },
        },
      ],
      feedback: {
        principle:
          'Manipulation does not always start with an obvious threat. Constant attention, heavy praise, quick familiarity and requests to move somewhere private are warning signs. Being friendly does not make someone trustworthy.',
        recommendedAction: 'Keep conversations on the platform, share nothing private, and check any claims yourself.',
      },
      clue: {
        id: 'MK-A1-PBI-01',
        group: 'PBI-01',
        fragment: 'PROFILE MATCH: CREATOR / HIGH SOCIAL VALIDATION RESPONSE',
        requires: ['MK-A1-ART-01', 'MK-A1-ART-03'],
      },
      hints: [
        { afterSeconds: 10, text: 'This person got close very fast...' },
        { afterSeconds: 20, text: 'Check who StarWatcher really is.', app: 'social' },
        { afterSeconds: 30, text: 'Look at how long this account has existed.', highlightArtifactId: 'MK-A1-ART-02' },
      ],
    },

    // ------------------------------------------------------------ A2
    {
      id: 'MK-A2',
      characterId: 'mika',
      archetype: 'A2',
      category: 'awareness',
      title: 'Unfiltered Creator Circle',
      lesson: 'Identifying harmful escalation and manipulative online communities.',
      trigger: {
        app: 'social',
        sender: 'Unfiltered Creators',
        title: 'Community invite',
        message: 'You have been invited to Unfiltered Creators. Private community, 438 members.',
      },
      thread: [
        { from: 'them', sender: 'ClipKing', text: 'The algorithm buries small creators. We need to stop pretending the system is fair.' },
        { from: 'them', sender: 'NullFrame', text: "It's not just unfair. People who disagree with us are part of the problem. They don't deserve a voice." },
        { from: 'them', sender: 'RedSignal', text: 'People are too comfortable with everything. Maybe things need to get worse before anyone wakes up.' },
        { from: 'them', sender: 'Moderator', text: "Don't question the direction of this group. If you're uncomfortable, you're not one of us." },
        { from: 'me', text: 'I joined because I wanted creator advice. This feels different.' },
        { from: 'them', sender: 'ClipKing', text: "You're finally seeing how things really work." },
        { from: 'me', text: 'I just wanted to learn how to grow my channel.' },
        { from: 'them', sender: 'NullFrame', text: 'Then stop being passive. People outside this group are the enemy.' },
        { from: 'me', text: "I don't think that's what I signed up for." },
        { from: 'them', sender: 'Moderator', text: "You either understand us or you're against us." },
      ],
      artifacts: [
        { id: 'MK-A2-ART-01', label: 'Community guidelines', app: 'social', detail: 'The group discourages criticism and demands that members think alike.', isKeyEvidence: true },
        { id: 'MK-A2-ART-02', label: 'Discussion history', app: 'social', detail: 'Talk shifts from ordinary complaints to treating outsiders as less than human and excusing destructive behavior.', isKeyEvidence: true },
        { id: 'MK-A2-ART-03', label: 'Moderation record', app: 'social', detail: 'Members who disagree are removed or publicly shamed.', isKeyEvidence: true },
      ],
      prompt: 'What should Mika do?',
      choices: [
        {
          id: 'MK-A2-c1',
          text: 'Stay in the group because its members understand the frustrations of small creators.',
          isCorrect: false,
          outcome: 'Mika stays exposed to manipulative group pressure.',
          consequence: { kind: 'pressure', message: "Moderator: Glad you're staying. Prove you belong here." },
        },
        {
          id: 'MK-A2-c2',
          text: 'Recognize the escalating hostility, leave, keep evidence, and report credible threats through the proper channels.',
          isCorrect: true,
          outcome: 'Mika leaves safely and knows the warning signs.',
          consequence: { kind: 'none' },
        },
        {
          id: 'MK-A2-c3',
          text: "Agree with the group's hostility to prove loyalty.",
          isCorrect: false,
          outcome: 'She reinforces the harmful behavior.',
          consequence: { kind: 'antagonist', message: 'INFLUENCE PROFILE UPDATED.' },
        },
      ],
      feedback: {
        principle:
          'A community can start with real frustrations and slowly normalize dehumanization, isolation and destructive or violent attitudes. Watch for escalating hostility, demands for loyalty, punished disagreement, and outsiders described as not deserving safety.',
        recommendedAction: 'Leave, keep the evidence, and report credible threats to the platform or a trusted adult.',
      },
      clue: {
        id: 'MK-A2-PBI-04',
        group: 'PBI-04',
        fragment: 'INFLUENCE PROFILE: GENERATED / GROUP CONFORMITY',
        requires: ['MK-A2-ART-02', 'MK-A2-ART-03'],
      },
      hints: [
        { afterSeconds: 10, text: 'How does this group treat people who disagree?' },
        { afterSeconds: 20, text: 'Read the group rules and what happened to past members.', app: 'social' },
        { afterSeconds: 30, text: 'Check the moderation record.', highlightArtifactId: 'MK-A2-ART-03' },
      ],
    },

    // ------------------------------------------------------------ A3
    {
      id: 'MK-A3',
      characterId: 'mika',
      archetype: 'A3',
      category: 'awareness',
      title: 'Sponsorship Deadline',
      lesson: 'Recognizing urgency and emotional pressure in a suspicious opportunity.',
      trigger: {
        app: 'messages',
        sender: 'Agency Representative',
        title: 'Agency Representative',
        message: "We've been following your channel. We want to offer you a paid sponsorship.",
      },
      thread: [
        { from: 'me', text: 'Thank you! Could you send the details?' },
        { from: 'them', sender: 'Agency Representative', text: 'Of course. We have a limited creator budget.' },
        { from: 'me', text: "What's the deadline?" },
        { from: 'them', sender: 'Agency Representative', text: "Tonight. We've already selected you, but we need confirmation before we move to another creator." },
        { from: 'me', text: 'Can I review the contract first?' },
        { from: 'them', sender: 'Agency Representative', text: "You're making this difficult. We thought you were serious about growing." },
        { from: 'them', sender: 'Agency Representative', text: "Opportunities don't wait forever." },
      ],
      artifacts: [
        { id: 'MK-A3-ART-01', label: 'Sponsorship message', app: 'messages', detail: 'The representative keeps pushing the deadline.', isKeyEvidence: true },
        { id: 'MK-A3-ART-02', label: 'Offer summary', app: 'email', detail: 'The pay and the work expected are both unclear.', isKeyEvidence: true },
        { id: 'MK-A3-ART-03', label: 'Agency profile', app: 'browser', detail: "Nothing independent confirms the representative works for the agency they name.", isKeyEvidence: true },
      ],
      prompt: 'What should Mika do?',
      choices: [
        {
          id: 'MK-A3-c1',
          text: 'Accept immediately because the opportunity might disappear.',
          isCorrect: false,
          outcome: 'Mika risks signing up to an unclear agreement.',
          consequence: { kind: 'pressure', message: 'Agency Representative: Great. Send your full name, address and ID tonight.' },
        },
        {
          id: 'MK-A3-c2',
          text: 'Ask for company details she can verify and the full agreement, then review it without letting the deadline decide.',
          isCorrect: true,
          outcome: 'Mika keeps control and makes an informed decision.',
          consequence: { kind: 'none' },
        },
        {
          id: 'MK-A3-c3',
          text: 'Send personal information to show commitment.',
          isCorrect: false,
          outcome: 'She exposes personal information she did not need to share.',
          consequence: { kind: 'antagonist', message: 'BEHAVIORAL PROFILE INDEXED.' },
        },
      ],
      feedback: {
        principle:
          'Urgency is used to stop people from checking details. A real deadline does not remove the need to verify the organization, read the terms and protect your personal information.',
        recommendedAction: 'Slow down: ask for verifiable details and the full agreement before saying yes.',
      },
      clue: {
        id: 'MK-A3-PBI-03',
        group: 'PBI-03',
        fragment: 'BEHAVIORAL PROFILE INDEXED / OPPORTUNITY SENSITIVITY',
        requires: ['MK-A3-ART-01', 'MK-A3-ART-02'],
      },
      hints: [
        { afterSeconds: 10, text: 'Why does this have to happen tonight?' },
        { afterSeconds: 20, text: 'Check what the offer actually says.', app: 'email' },
        { afterSeconds: 30, text: 'Look at the offer summary.', highlightArtifactId: 'MK-A3-ART-02' },
      ],
    },

    // ------------------------------------------------------------ R1
    {
      id: 'MK-R1',
      characterId: 'mika',
      archetype: 'R1',
      category: 'responsibility',
      title: 'Creator Account Verification',
      lesson: 'Identifying credential-harvesting attempts and protecting account access.',
      trigger: {
        app: 'email',
        sender: 'account-review@creator-support.example',
        title: 'Immediate Creator Account Verification Required',
        message: 'Your creator account may be restricted due to a verification issue. Confirm your account through the verification portal below to prevent temporary suspension.',
      },
      thread: [
        { from: 'system', text: 'Link destination: creator-verification.example' },
        { from: 'me', sender: 'Mika', text: 'Wait, am I actually getting suspended?' },
        { from: 'them', sender: 'Rafa', text: 'Did you check whether that email really came from the platform?' },
        { from: 'me', sender: 'Mika', text: 'It looks official.' },
        { from: 'them', sender: 'Rafa', text: "That isn't enough. Check the sender and verify through the actual app or official website." },
      ],
      artifacts: [
        { id: 'MK-R1-ART-01', label: 'Sender information', app: 'email', detail: "The sender's domain does not match the platform's real domain.", isKeyEvidence: true },
        { id: 'MK-R1-ART-02', label: 'Link preview', app: 'browser', detail: 'The link goes somewhere unrelated to the official service.', isKeyEvidence: true },
        { id: 'MK-R1-ART-03', label: 'Account status', app: 'settings', detail: 'The real creator dashboard shows no suspension warning.', isKeyEvidence: true },
      ],
      prompt: 'What should Mika do?',
      choices: [
        {
          id: 'MK-R1-c1',
          text: 'Open the link and enter her account login.',
          isCorrect: false,
          outcome: 'Her login details may now be in someone else’s hands.',
          consequence: { kind: 'account_compromise', amount: 30, message: 'Password changed on your creator account. Was this you?' },
        },
        {
          id: 'MK-R1-c2',
          text: 'Ignore the email, open the platform through the official app or a typed address, and check her account status.',
          isCorrect: true,
          outcome: 'She checks the claim through a channel she trusts.',
          consequence: { kind: 'none' },
        },
        {
          id: 'MK-R1-c3',
          text: 'Reply to the email to ask whether it is real.',
          isCorrect: false,
          outcome: 'She engages with a sender she cannot verify.',
          consequence: { kind: 'pressure', message: 'account-review: Yes, this is official. Verify within 1 hour to avoid suspension.' },
        },
      ],
      feedback: {
        principle:
          "Never trust an email because it looks official. Check account warnings in the service's own app or website, and never enter passwords or codes through a link in an unexpected message.",
        recommendedAction: 'Go to the official app or type the address yourself to check your account. If the theft is confirmed, preserve the message and use the official PNP Anti-Cybercrime Group reporting channel through an official source.',
      },
      clue: {
        id: 'MK-R1-PBI-01',
        group: 'PBI-01',
        fragment: 'CONTACT GRAPH UPDATED / ACCOUNT ACCESS PATH IDENTIFIED',
        requires: ['MK-R1-ART-01', 'MK-R1-ART-02', 'MK-R1-ART-03'],
      },
      hints: [
        { afterSeconds: 10, text: 'Who actually sent this?' },
        { afterSeconds: 20, text: 'Compare the sender address with the real platform.', app: 'email' },
        { afterSeconds: 30, text: 'Check the sender information.', highlightArtifactId: 'MK-R1-ART-01' },
      ],
    },

    // ------------------------------------------------------------ R2
    {
      id: 'MK-R2',
      characterId: 'mika',
      archetype: 'R2',
      category: 'responsibility',
      title: 'Sponsorship Deposit',
      lesson: 'Recognizing advance-fee and payment manipulation.',
      trigger: {
        app: 'messages',
        sender: 'Brand Representative',
        title: 'Brand Representative',
        message: 'We want you to promote our new gaming product. ₱15,000 for one sponsored stream.',
      },
      advertisement: {
        id: 'MK-R2-ad',
        title: 'Gaming Launch Sponsor',
        description: 'Promote a new product after sending the displayed processing deposit.',
        destination: 'gaming-sponsor.example/deposit',
        suspicious: true,
        encounterId: 'MK-R2',
      },
      thread: [
        { from: 'me', text: "That sounds interesting. What's the compensation?" },
        { from: 'them', sender: 'Brand Representative', text: '₱15,000 for one sponsored stream.' },
        { from: 'them', sender: 'Brand Representative', text: 'We just need a refundable ₱1,500 processing deposit to activate your sponsorship.' },
        { from: 'me', text: 'Why would I need to pay a deposit?' },
        { from: 'them', sender: 'Brand Representative', text: "It's a standard creator verification process." },
        { from: 'me', text: 'Can I see the contract?' },
        { from: 'them', sender: 'Brand Representative', text: 'The deposit must be processed before the contract is issued. We have several creators waiting.' },
      ],
      artifacts: [
        { id: 'MK-R2-ART-01', label: 'Payment request', app: 'messages', detail: 'Mika has to pay before she receives the promised sponsorship.', isKeyEvidence: true },
        { id: 'MK-R2-ART-02', label: 'Company profile', app: 'browser', detail: 'The company cannot be verified anywhere independent.', isKeyEvidence: true },
        { id: 'MK-R2-ART-03', label: 'Payment instructions', app: 'wallet', detail: "The money goes to a personal account that has nothing to do with the agency.", isKeyEvidence: true },
      ],
      prompt: 'What should Mika do?',
      choices: [
        {
          id: 'MK-R2-c1',
          text: 'Pay the deposit because the sponsorship is worth much more.',
          isCorrect: false,
          outcome: 'Mika loses the money.',
          consequence: { kind: 'balance_loss', amount: 1500, message: 'Sent ₱1,500.00. The representative has stopped replying.' },
        },
        {
          id: 'MK-R2-c2',
          text: 'Refuse to pay, verify the company independently, and keep the messages.',
          isCorrect: true,
          outcome: 'Mika protects her money and keeps the evidence.',
          consequence: { kind: 'none' },
        },
        {
          id: 'MK-R2-c3',
          text: 'Negotiate the deposit down to ₱500.',
          isCorrect: false,
          outcome: 'She still accepts a suspicious payment setup.',
          consequence: { kind: 'balance_loss', amount: 500, message: 'Sent ₱500.00. "Thanks! One more fee will be needed."' },
        },
      ],
      feedback: {
        principle:
          'Be suspicious when a sponsor, employer or client asks you to pay first in order to get paid. Verify the organization and the payment arrangement yourself.',
        recommendedAction: 'Never pay a "deposit" to receive money. Verify the company and keep the messages. If money is lost or fraud is confirmed, contact the financial provider and use the official PNP ACG channel when appropriate.',
      },
      clue: {
        id: 'MK-R2-PBI-03',
        group: 'PBI-03',
        fragment: 'PLAYER VALUE: FINANCIAL INCENTIVE RESPONSE',
        requires: ['MK-R2-ART-01', 'MK-R2-ART-03'],
      },
      hints: [
        { afterSeconds: 10, text: 'Why would someone paying you need your money first?' },
        { afterSeconds: 20, text: 'Check where the deposit would actually go.', app: 'wallet' },
        { afterSeconds: 30, text: 'Look at the payment instructions.', highlightArtifactId: 'MK-R2-ART-03' },
      ],
    },

    // ------------------------------------------------------------ R3
    {
      id: 'MK-R3',
      characterId: 'mika',
      archetype: 'R3',
      category: 'responsibility',
      title: "Moderator's Warning",
      lesson: 'Independently verifying unexpected requests from supposedly trusted accounts.',
      trigger: {
        app: 'calls',
        sender: 'Moderator (verified community account)',
        title: 'Moderator',
        message: 'Mika, I need your help urgently.',
      },
      incomingCall: {
        caller: 'Moderator',
        context: 'Verified community account',
        content: 'Please send the verification code from the account alert. Do not contact the platform.',
        voicemail: 'Call from Moderator missed. The sender asks for a verification code.',
        callerColor: '#b69bd6',
        encounterId: 'MK-R3',
      },
      thread: [
        { from: 'them', sender: 'Moderator', text: 'Our community account is having a security issue.' },
        { from: 'me', text: 'What happened?' },
        { from: 'them', sender: 'Moderator', text: 'We need to confirm the accounts of selected creators. Send me the verification code you just received.' },
        { from: 'me', text: 'Why do you need that?' },
        { from: 'them', sender: 'Moderator', text: "I'm handling the issue. Please trust me. We don't have much time." },
      ],
      artifacts: [
        { id: 'MK-R3-ART-01', label: 'Previous conversation', app: 'messages', detail: "The moderator's usual way of writing is different from this message.", isKeyEvidence: true },
        { id: 'MK-R3-ART-02', label: 'Account activity notice', app: 'social', detail: "The platform reports an unfamiliar sign-in on the moderator's account.", isKeyEvidence: true },
        { id: 'MK-R3-ART-03', label: 'Independent confirmation', app: 'social', detail: "Another admin warns that the moderator's account may be compromised and says not to follow its recent requests.", isKeyEvidence: true },
      ],
      prompt: 'What should Mika do?',
      choices: [
        {
          id: 'MK-R3-c1',
          text: 'Send the verification code because the moderator is trusted.',
          isCorrect: false,
          outcome: 'Mika may have helped an attacker get into an account.',
          consequence: { kind: 'account_compromise', amount: 30, message: 'Your account was signed in from a new device using a verification code.' },
        },
        {
          id: 'MK-R3-c2',
          text: "Don't share the code. Contact the moderator through a separate channel she already trusts, and follow the platform's security advice.",
          isCorrect: true,
          outcome: 'She keeps the code safe and checks who she is really talking to.',
          consequence: { kind: 'none' },
        },
        {
          id: 'MK-R3-c3',
          text: 'Ask the account for more personal details to prove who it is.',
          isCorrect: false,
          outcome: 'A hijacked account can easily supply convincing fake details.',
          consequence: { kind: 'pressure', message: "Moderator: It's me, I promise. Remember our stream last week? Now send the code." },
        },
      ],
      feedback: {
        principle:
          'A familiar account is not proof that the real person is using it. Hijacked accounts send convincing messages through existing relationships. Never share passwords or one-time codes.',
        recommendedAction: 'Check unusual requests through a separate channel you already trust. Secure the account and, if the compromise is confirmed, preserve evidence and use the official PNP ACG reporting channel.',
      },
      clue: {
        id: 'MK-R3-PBI-02',
        group: 'PBI-02',
        fragment: 'TRUST NETWORK: MAPPED / AUTHENTICITY NOT GUARANTEED',
        requires: ['MK-R3-ART-01', 'MK-R3-ART-03'],
      },
      hints: [
        { afterSeconds: 10, text: 'Does this sound like the moderator you know?' },
        { afterSeconds: 20, text: 'See if anyone else in the community has noticed something.', app: 'social' },
        { afterSeconds: 30, text: 'Check the independent confirmation.', highlightArtifactId: 'MK-R3-ART-03' },
      ],
    },

    // ------------------------------------------------------------ O1
    {
      id: 'MK-O1',
      characterId: 'mika',
      archetype: 'O1',
      category: 'opportunity',
      title: 'Agency Partnership',
      lesson: 'Verifying professional opportunities and reviewing agreements.',
      trigger: {
        app: 'email',
        sender: 'Creator management agency',
        title: 'Exclusive Creator Management Partnership',
        message: 'We are pleased to offer you an exclusive creator partnership. Please sign the attached agreement within 24 hours.',
      },
      thread: [
        { from: 'them', sender: 'Agency', text: 'Dear Mika, we are pleased to offer you an exclusive creator partnership.' },
        { from: 'them', sender: 'Agency', text: 'Our agency will handle your sponsorship negotiations and manage your creator growth.' },
        { from: 'them', sender: 'Agency', text: 'In exchange, we request exclusive management rights over your creator accounts and associated revenue.' },
        { from: 'them', sender: 'Agency', text: 'Please sign the attached agreement within 24 hours.' },
      ],
      artifacts: [
        { id: 'MK-O1-ART-01', label: 'Agency website', app: 'browser', detail: 'The company gives few details you can verify about its staff or history.', isKeyEvidence: true },
        { id: 'MK-O1-ART-02', label: 'Contract', app: 'email', detail: 'The agreement hands over broad control of her accounts and has unclear exit terms.', isKeyEvidence: true },
        { id: 'MK-O1-ART-03', label: 'Contact information', app: 'browser', detail: 'The business address and representatives cannot be confirmed anywhere independent.', isKeyEvidence: true },
      ],
      prompt: 'What should Mika do?',
      choices: [
        {
          id: 'MK-O1-c1',
          text: 'Sign immediately because professional management could help her grow.',
          isCorrect: false,
          outcome: 'Mika may be locked into a bad agreement.',
          consequence: { kind: 'antagonist', message: 'ACCESS RIGHTS GRANTED.' },
        },
        {
          id: 'MK-O1-c2',
          text: 'Verify the agency independently, read the contract carefully, and get qualified advice before giving up any account or money control.',
          isCorrect: true,
          outcome: 'She judges the offer without giving up control too early.',
          consequence: { kind: 'none' },
        },
        {
          id: 'MK-O1-c3',
          text: 'Give the agency her login so it can start right away.',
          isCorrect: false,
          outcome: 'Her account is at immediate risk.',
          consequence: { kind: 'account_compromise', amount: 30, message: 'Your account email was changed.' },
        },
      ],
      feedback: {
        principle:
          'Judge professional offers by information you can verify, clear terms and reasonable permissions. A polished website or a formal contract does not prove an offer is real.',
        recommendedAction: 'Verify the company and get advice before signing anything that controls your accounts or income.',
      },
      clue: {
        id: 'MK-O1-PBI-04',
        group: 'PBI-04',
        fragment: 'AGENCY CONTROL INDICATOR / CREATOR NETWORK',
        requires: ['MK-O1-ART-01', 'MK-O1-ART-02', 'MK-O1-ART-03'],
      },
      hints: [
        { afterSeconds: 10, text: 'What exactly would Mika be giving away?' },
        { afterSeconds: 20, text: 'Look the agency up yourself.', app: 'browser' },
        { afterSeconds: 30, text: 'Read the contract terms.', highlightArtifactId: 'MK-O1-ART-02' },
      ],
    },

    // ------------------------------------------------------------ O2
    {
      id: 'MK-O2',
      characterId: 'mika',
      archetype: 'O2',
      category: 'opportunity',
      title: 'Creator Software Test',
      lesson: 'Evaluating software downloads, permissions and professional requests.',
      trigger: {
        app: 'messages',
        sender: 'Recruiter',
        title: 'Recruiter',
        message: 'We are looking for creators to test our new editing software.',
      },
      thread: [
        { from: 'me', text: 'Is it free?' },
        { from: 'them', sender: 'Recruiter', text: 'Yes. Just install the software and create a short sample video.' },
        { from: 'system', text: 'Attachment: installer file' },
        { from: 'me', text: 'Can I download it from your official website?' },
        { from: 'them', sender: 'Recruiter', text: 'Our website is currently being updated. The installer is attached.' },
        { from: 'me', text: 'Is there a product page or documentation?' },
        { from: 'them', sender: 'Recruiter', text: "Don't worry. The software is safe. Just disable your antivirus if it gives you a warning." },
        { from: 'me', text: 'That seems suspicious.' },
      ],
      artifacts: [
        { id: 'MK-O2-ART-01', label: 'Attachment details', app: 'messages', detail: 'The installer is an unexpected executable with no publisher you can verify.', isKeyEvidence: true },
        { id: 'MK-O2-ART-02', label: 'Recruiter profile', app: 'browser', detail: "The agency doesn't list the recruiter as an employee.", isKeyEvidence: true },
        { id: 'MK-O2-ART-03', label: 'Installation instructions', app: 'messages', detail: 'The instructions tell her to turn off her security protection.', isKeyEvidence: true },
      ],
      prompt: 'What should Mika do?',
      choices: [
        {
          id: 'MK-O2-c1',
          text: 'Install the software and follow the instructions.',
          isCorrect: false,
          outcome: 'Her device could now be exposed to malicious software.',
          consequence: { kind: 'account_compromise', amount: 20, message: 'Unknown process running in the background.' },
        },
        {
          id: 'MK-O2-c2',
          text: 'Refuse to run the file, verify the recruiter and the software independently, and report the request if needed.',
          isCorrect: true,
          outcome: 'She avoids running an untrusted file and checks the offer.',
          consequence: { kind: 'none' },
        },
        {
          id: 'MK-O2-c3',
          text: 'Turn off antivirus for a moment, install it, then turn protection back on.',
          isCorrect: false,
          outcome: 'She deliberately weakens her device protection.',
          consequence: { kind: 'glitch' },
        },
      ],
      feedback: {
        principle:
          'Do not run unknown attachments just because they come with a job or opportunity. Check the sender, publisher, download source, file type and permissions. Being told to disable security is a serious warning sign.',
        recommendedAction: 'Only install software from the official source, and never turn off protection to do it.',
      },
      clue: {
        id: 'MK-O2-PBI-05',
        group: 'PBI-05',
        fragment: 'SOFTWARE DELIVERY INDICATOR / DEVICE EXPOSURE PATH',
        requires: ['MK-O2-ART-01', 'MK-O2-ART-02'],
      },
      hints: [
        { afterSeconds: 10, text: 'Where is this file really coming from?' },
        { afterSeconds: 20, text: 'Check whether this recruiter works where they say.', app: 'browser' },
        { afterSeconds: 30, text: 'Look at the attachment details.', highlightArtifactId: 'MK-O2-ART-01' },
      ],
    },
  ],
}
