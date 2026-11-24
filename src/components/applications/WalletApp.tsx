import { Coffee, TrainFront, ShoppingBag } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { AppliedConsequence } from '../../game/types'

export function WalletApp({ data, balance, consequences = [] }: { data?: CharacterPhoneData; balance?: number; consequences?: AppliedConsequence[] }) {
  const consequenceTransactions = consequences.filter(item => item.kind === 'balance_loss').map(item => ({
    name: 'Unverified payment',
    detail: item.encounterId,
    amount: -(item.amount ?? 0),
  }))
  const transactions = [...consequenceTransactions, ...(data?.walletTransactions ?? [])]
  return (
    <div className="app-content wallet-app">
      <div className="app-title-row"><h2>Wallet</h2><button>＋</button></div>
      <div className="bank-card">
        <div><span>Fictional Credit</span><strong>•• 4182</strong></div>
        <span>Available</span><b>₱{(balance ?? data?.walletBalance ?? 1284.5).toLocaleString()}</b>
      </div>
      <h3>Recent activity</h3>
      <div className="transaction-list">
        {transactions.map((item, index) => (
          <div className="transaction" key={item.name}>
            <span className={`transaction-icon t${index % 3}`}>{index === 0 ? <TrainFront size={17} /> : index === 1 ? <Coffee size={17} /> : <ShoppingBag size={17} />}</span>
            <div><strong>{item.name}</strong><small>{item.detail}</small></div><b>{item.amount < 0 ? `-₱${Math.abs(item.amount).toLocaleString()}` : `₱${item.amount.toLocaleString()}`}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
