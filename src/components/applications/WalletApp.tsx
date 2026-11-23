import { Coffee, TrainFront, ShoppingBag } from 'lucide-react'

export function WalletApp() {
  return (
    <div className="app-content wallet-app">
      <div className="app-title-row"><h2>Wallet</h2><button>＋</button></div>
      <div className="bank-card">
        <div><span>Fictional Credit</span><strong>•• 4182</strong></div>
        <span>Available</span><b>$1,284.50</b>
      </div>
      <h3>Recent activity</h3>
      <div className="transaction-list">
        {[
          { icon: TrainFront, name: 'Northbridge Transit', detail: 'Today · 10:21', amount: '-$4.25' },
          { icon: Coffee, name: 'Juniper Cafe', detail: 'Yesterday · 08:40', amount: '-$7.80' },
          { icon: ShoppingBag, name: 'Market District', detail: 'Mon · 18:12', amount: '-$32.16' },
        ].map((item, index) => (
          <div className="transaction" key={item.name}><span className={`transaction-icon t${index}`}><item.icon size={17} /></span><div><strong>{item.name}</strong><small>{item.detail}</small></div><b>{item.amount}</b></div>
        ))}
      </div>
    </div>
  )
}
