import { useState } from 'react'
import { Coffee, TrainFront, ShoppingBag } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { AppliedConsequence } from '../../game/types'
import type { Game } from '../../game/useGame'
import { usePassiveClueTarget } from '../investigation/PassiveClueTarget'
import { ScenarioPhoneInteraction } from './ScenarioPhoneInteraction'
import { interactionsFor } from './phoneInteractionUtils'

export function WalletApp({ game, data, balance, consequences = [] }: { game: Game; data?: CharacterPhoneData; balance?: number; consequences?: AppliedConsequence[] }) {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<number | null>(null)
  const consequenceTransactions = consequences.filter(item => item.kind === 'balance_loss').map(item => ({
    name: 'Unverified payment',
    detail: item.encounterId,
    amount: -(item.amount ?? 0),
  }))
  const transactions = [...consequenceTransactions, ...(data?.walletTransactions ?? [])]
  const paymentInteractions = interactionsFor(game, 'wallet', 'payment-send', 'payment-decline', 'menu-item')
  const hasPaymentRequest = Boolean(game.encounter?.artifacts.some(artifact => artifact.app === 'wallet') || paymentInteractions.length > 0)
  const paymentArtifact = game.encounter?.artifacts.find(artifact => artifact.app === 'wallet')
  const transactionHistoryReviewed = Boolean(game.encounter && game.state.performedPhoneInteractions[game.encounter.id]?.some(id =>
    game.resolutionAction?.action.interactions.some(interaction => interaction.id === id && interaction.actionType === 'reviewTransactions'),
  ))
  const paymentClueRef = usePassiveClueTarget(game, 'wallet', 'app', paymentOpen && selectedTransaction === null)
  return (
    <div className="app-content wallet-app">
      <div className="app-title-row"><h2>Wallet</h2><button>＋</button></div>
      <div className="bank-card">
        <div><span>Fictional Credit</span><strong>•• 4182</strong></div>
        <span>Available</span><b>₱{(balance ?? data?.walletBalance ?? 1284.5).toLocaleString()}</b>
      </div>
      {hasPaymentRequest && (
        <section className="wallet-request">
          {!paymentOpen ? (
            <button onClick={() => setPaymentOpen(true)}>Pending payment request</button>
          ) : (
            <div ref={paymentClueRef}>
              <button className="detail-back" onClick={() => setPaymentOpen(false)}>Wallet</button>
              <h3>Payment request</h3>
              <strong>{game.encounter?.trigger.sender}</strong>
              <p>{game.encounter?.trigger.message}</p>
              {paymentArtifact && <p className="wallet-recipient-detail" data-clue-target={paymentArtifact.id}>{paymentArtifact.detail}</p>}
              <div className="wallet-native-actions" aria-label="Payment request options">
                {paymentInteractions.map(interaction => (
                  <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction}>
                    {interaction.control === 'payment-send'
                      ? `Send${interaction.label.match(/₱[\d,]+/) ? ` ${interaction.label.match(/₱[\d,]+/)?.[0]}` : ''}`
                      : interaction.control === 'payment-decline'
                        ? /campus|office/i.test(interaction.label) ? 'Use campus payment' : 'Decline'
                        : interaction.label}
                  </ScenarioPhoneInteraction>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <h3>Recent activity</h3>
      {transactionHistoryReviewed && paymentArtifact && (
        <section className="wallet-transaction-detail" aria-label="Reviewed payment request details">
          <strong>Request under review · {game.encounter?.trigger.sender}</strong>
          <p>{game.encounter?.trigger.message}</p>
          <p>{paymentArtifact.detail}</p>
          <small>Reviewing this request does not send money or resolve the incident.</small>
        </section>
      )}
      <div className="transaction-list">
        {transactions.map((item, index) => (
          <button className="transaction transaction-button" key={`${item.name}-${index}`} onClick={() => setSelectedTransaction(index)}>
            <span className={`transaction-icon t${index % 3}`}>{index === 0 ? <TrainFront size={17} /> : index === 1 ? <Coffee size={17} /> : <ShoppingBag size={17} />}</span>
            <div><strong>{item.name}</strong><small>{item.detail}</small></div><b>{item.amount < 0 ? `-₱${Math.abs(item.amount).toLocaleString()}` : `₱${item.amount.toLocaleString()}`}</b>
          </button>
        ))}
      </div>
      {selectedTransaction !== null && transactions[selectedTransaction] && (
        <section className="wallet-transaction-detail">
          <button className="detail-back" onClick={() => setSelectedTransaction(null)}>Activity</button>
          <strong>{transactions[selectedTransaction].name}</strong>
          <p>{transactions[selectedTransaction].detail}</p>
        </section>
      )}
    </div>
  )
}
