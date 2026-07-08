'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ==================== TYPES ====================

interface Client {
  id: string
  nom: string
  telephone: string
  prix_total: number
  ambassadeur: string | null
  date_livraison: string | null
}

interface Paiement {
  id: string
  client_id: string
  montant: number
  commentaire: string | null
  date_paiement: string | null
}

interface ClientWithStats extends Client {
  totalPaye: number
  resteAPayer: number
  progression: number
  statut: 'Soldé' | 'En cours' | 'Non payé'
}

interface Ambassadeur {
  nom: string
  clients: number
  commissions: number
  verseTotal: number
}

const AMBASSADEURS_LIST = ['Aucun', 'amb1', 'amb2', 'amb3', 'amb4', 'amb5', 'amb6', 'amb7', 'amb8', 'amb9', 'amb10']

const formatFCFA = (amount: number) =>
  new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(Number(amount) || 0))) + ' F CFA'

const getErrorMessage = (err: unknown, fallback = 'Erreur') =>
  err instanceof Error ? err.message : fallback

const getWhatsAppPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')

  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('225')) return digits

  return `225${digits}`
}

const getPaymentReminderUrl = (client: ClientWithStats) => {
  const message = [
    `Bonjour ${client.nom},`,
    `Petit rappel concernant votre paiement chez THE TRUST.`,
    `Montant total : ${formatFCFA(client.prix_total)}`,
    `Déjà payé : ${formatFCFA(client.totalPaye)}`,
    `Reste à payer : ${formatFCFA(client.resteAPayer)}`,
    'Merci de faire le nécessaire dès que possible.',
  ].join('\n')

  return `https://wa.me/${getWhatsAppPhone(client.telephone)}?text=${encodeURIComponent(message)}`
}

const getPaymentReminderText = (client: ClientWithStats) =>
  `Envoyer un rappel WhatsApp à ${client.nom} pour ${formatFCFA(client.resteAPayer)} restant ?`

// ==================== MAIN COMPONENT ====================

export default function Home() {
  // === STATE - Navigation ===
  const [activeTab, setActiveTab] = useState<'trust' | 'ambassadeurs'>('trust')

  // === STATE - Data ===
  const [clients, setClients] = useState<ClientWithStats[]>([])
  const [paiements, setPaiements] = useState<Paiement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // === STATE - Search ===
  const [searchQuery, setSearchQuery] = useState('')
  const filteredClients = clients.filter(
    (c) =>
      c.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.telephone.includes(searchQuery)
  )

  // === STATE - Modals ===
  const [showNewClientModal, setShowNewClientModal] = useState(false)
  const [showClientProfile, setShowClientProfile] = useState(false)
  const [showNewCommandeModal, setShowNewCommandeModal] = useState(false)
  const [showAmbPaymentModal, setShowAmbPaymentModal] = useState<string | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  // === STATE - Selected ===
  const [selectedClient, setSelectedClient] = useState<ClientWithStats | null>(null)
  const [selectedAmb, setSelectedAmb] = useState<string | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<Paiement | null>(null)

  // === STATE - Forms ===
  const [newClientForm, setNewClientForm] = useState({
    nom: '',
    telephone: '',
    prix_total: '',
    ambassadeur: 'Aucun',
    date_livraison: '',
  })
  const [newPaymentForm, setNewPaymentForm] = useState({
    montant: '',
    commentaire: '',
  })
  const [newCommandeForm, setNewCommandeForm] = useState({
    montant: '',
  })
  const [ambPaymentForm, setAmbPaymentForm] = useState({
    montant: '',
  })

  // === STATE - UI ===
  const [formError, setFormError] = useState<string | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  // === STATE - Ambassador Payments (Local Storage) ===
  const [ambassadorVersements, setAmbassadorVersements] = useState<Record<string, number>>({})

  // ==================== DATA LOADING ====================

  const loadData = useCallback(async (): Promise<ClientWithStats[]> => {
    try {
      setLoading(true)
      setError(null)

      // Fetch clients with ambassadeur field
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, nom, telephone, prix_total, ambassadeur, date_livraison')

      if (clientsError) throw clientsError

      // Fetch paiements
      const { data: paiementsData, error: paiementsError } = await supabase
        .from('paiements')
        .select('id, client_id, montant, commentaire, date_paiement')

      if (paiementsError) throw paiementsError

      const dataClients = (clientsData || []) as Client[]
      const dataPaiements = (paiementsData || []) as Paiement[]

      setPaiements(dataPaiements)

      // Calculate stats for each client
      const clientsWithStats: ClientWithStats[] = dataClients.map((client) => {
        const clientPaiements = dataPaiements.filter((p) => p.client_id === client.id)
        const totalPaye = clientPaiements.reduce((sum, p) => sum + (Number(p.montant) || 0), 0)
        const prixTotal = Number(client.prix_total) || 0
        const resteAPayer = Math.max(0, prixTotal - totalPaye)
        const progression = prixTotal > 0 ? (totalPaye / prixTotal) * 100 : 0

        let statut: 'Soldé' | 'En cours' | 'Non payé'
        if (progression === 0) {
          statut = 'Non payé'
        } else if (progression >= 100) {
          statut = 'Soldé'
        } else {
          statut = 'En cours'
        }

        return {
          ...client,
          totalPaye,
          resteAPayer,
          progression: Math.min(progression, 100),
          statut,
        }
      })

      setClients(clientsWithStats)
      return clientsWithStats
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Erreur lors du chargement'))
      console.error(err)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void loadData()
    })

    const channel = supabase
      .channel('trust-dashboard-live-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        void loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paiements' }, () => {
        void loadData()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadData])

  // ==================== HANDLERS ====================

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault()

    if (
      !newClientForm.nom.trim() ||
      !newClientForm.telephone.trim() ||
      !newClientForm.prix_total.trim() ||
      !newClientForm.date_livraison.trim()
    ) {
      setFormError('Tous les champs requis doivent être remplis')
      return
    }

    const prixTotal = Number(newClientForm.prix_total)
    if (isNaN(prixTotal) || prixTotal <= 0) {
      setFormError('Le montant doit être un nombre positif')
      return
    }

    try {
      setFormLoading(true)
      setFormError(null)

      const ambassadeur = newClientForm.ambassadeur === 'Aucun' ? null : newClientForm.ambassadeur

      const { error } = await supabase.from('clients').insert([
        {
          nom: newClientForm.nom.trim(),
          telephone: newClientForm.telephone.trim(),
          prix_total: prixTotal,
          ambassadeur,
          date_livraison: newClientForm.date_livraison,
        },
      ])

      if (error) throw error

      setNewClientForm({
        nom: '',
        telephone: '',
        prix_total: '',
        ambassadeur: 'Aucun',
        date_livraison: '',
      })
      setShowNewClientModal(false)
      await loadData()
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    } finally {
      setFormLoading(false)
    }
  }

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedClient || !newPaymentForm.montant.trim()) {
      setFormError('Le montant est requis')
      return
    }

    const montant = Number(newPaymentForm.montant)
    if (isNaN(montant) || montant <= 0) {
      setFormError('Le montant doit être positif')
      return
    }

    try {
      setFormLoading(true)
      setFormError(null)

      const { error } = await supabase.from('paiements').insert([
        {
          client_id: selectedClient.id,
          montant,
          commentaire: newPaymentForm.commentaire.trim() || null,
          date_paiement: new Date().toISOString(),
        },
      ])

      if (error) throw error

      setNewPaymentForm({ montant: '', commentaire: '' })
      const updatedClients = await loadData()

      const updatedClient = updatedClients.find((c) => c.id === selectedClient.id)
      if (updatedClient) setSelectedClient(updatedClient)
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    } finally {
      setFormLoading(false)
    }
  }

  const handleAddCommande = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedClient || !newCommandeForm.montant.trim()) {
      setFormError('Le montant est requis')
      return
    }

    const montant = Number(newCommandeForm.montant)
    if (isNaN(montant) || montant <= 0) {
      setFormError('Le montant doit être positif')
      return
    }

    try {
      setFormLoading(true)
      setFormError(null)

      const newTotal = selectedClient.prix_total + montant

      const { error } = await supabase
        .from('clients')
        .update({ prix_total: newTotal })
        .eq('id', selectedClient.id)

      if (error) throw error

      setNewCommandeForm({ montant: '' })
      setShowNewCommandeModal(false)
      setShowClientProfile(false)
      await loadData()
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteClient = async (clientId: string) => {
    const client = clients.find((c) => c.id === clientId)
    if (!client) return

    if (!window.confirm(`Supprimer "${client.nom}" et tout son historique ?`)) return

    try {
      setFormLoading(true)

      // 1. Delete paiements
      const { error: errPay } = await supabase
        .from('paiements')
        .delete()
        .eq('client_id', clientId)

      if (errPay) throw errPay

      // 2. Delete client
      const { error: errClient } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId)

      if (errClient) throw errClient

      setShowClientProfile(false)
      setSelectedClient(null)
      await loadData()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setFormLoading(false)
    }
  }

  const handleAddAmbassadorPayment = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedAmb || !ambPaymentForm.montant.trim()) {
      setFormError('Le montant est requis')
      return
    }

    const montant = Number(ambPaymentForm.montant)
    if (isNaN(montant) || montant <= 0) {
      setFormError('Le montant doit être positif')
      return
    }

    try {
      setFormLoading(true)
      setFormError(null)

      setAmbassadorVersements({
        ...ambassadorVersements,
        [selectedAmb]: (ambassadorVersements[selectedAmb] || 0) + montant,
      })

      setAmbPaymentForm({ montant: '' })
      setShowAmbPaymentModal(null)
      setSelectedAmb(null)
    } catch (err: unknown) {
      setFormError(getErrorMessage(err))
    } finally {
      setFormLoading(false)
    }
  }

  // ==================== CALCULATIONS ====================

  const calculateStats = () => {
    const caGlobal = clients.reduce((sum, c) => sum + (Number(c.prix_total) || 0), 0)
    const totalEncaisse = clients.reduce((sum, c) => sum + (Number(c.totalPaye) || 0), 0)
    const resteRecouvrer = clients.reduce((sum, c) => sum + (Number(c.resteAPayer) || 0), 0)

    return { caGlobal, totalEncaisse, resteRecouvrer }
  }

  const getStatusCount = () => {
    return {
      solde: clients.filter((c) => c.statut === 'Soldé').length,
      encours: clients.filter((c) => c.statut === 'En cours').length,
      nonpaye: clients.filter((c) => c.statut === 'Non payé').length,
      retard: clients.filter((c) => calculatePaymentDelay(c) > 0).length,
    }
  }

  const calculatePaymentDelay = (client: ClientWithStats): number => {
    if (client.statut !== 'En cours') return 0

    const clientPayments = paiements
      .filter((p) => p.client_id === client.id)
      .sort((a, b) => {
        const dateA = new Date(a.date_paiement || 0).getTime()
        const dateB = new Date(b.date_paiement || 0).getTime()
        return dateB - dateA
      })

    let referenceDate: Date | null = null

    if (clientPayments.length > 0 && clientPayments[0].date_paiement) {
      referenceDate = new Date(clientPayments[0].date_paiement)
    } else if (client.date_livraison) {
      referenceDate = new Date(client.date_livraison)
    }

    if (!referenceDate) return 0

    const today = new Date()
    const diffMs = today.getTime() - referenceDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    return Math.max(0, diffDays - 7)
  }

  const getStatusColor = (statut: string) => {
    switch (statut) {
      case 'Soldé':
        return { icon: '🟢', label: 'Excellent Payeur', color: 'text-green-400' }
      case 'En cours':
        return { icon: '🟡', label: 'Payeur Régulier', color: 'text-orange-400' }
      case 'Non payé':
        return { icon: '🔴', label: 'Mauvais Payeur', color: 'text-red-400' }
      default:
        return { icon: '⚪', label: 'Inconnu', color: 'text-gray-400' }
    }
  }

  const calculateAmbassadors = (): Record<string, Ambassadeur> => {
    const result: Record<string, Ambassadeur> = {}

    AMBASSADEURS_LIST.forEach((amb) => {
      const ambClients =
        amb === 'Aucun'
          ? clients.filter((c) => !c.ambassadeur)
          : clients.filter((c) => c.ambassadeur === amb)

      const nbClients = ambClients.length
      const commissions = nbClients * 1000
      const verseTotal = ambassadorVersements[amb] || 0

      result[amb] = {
        nom: amb,
        clients: nbClients,
        commissions,
        verseTotal,
      }
    })

    return result
  }

  // ==================== RENDER FUNCTIONS ====================

  const renderPieChart = () => {
    const statusCount = getStatusCount()
    const total = clients.length

    if (total === 0) {
      return (
        <div className="flex items-center justify-center h-48 text-gray-400">
          <p className="text-xs">Pas assez de données</p>
        </div>
      )
    }

    const soldePercent = (statusCount.solde / total) * 100
    const encourPercent = (statusCount.encours / total) * 100
    const nonpayePercent = (statusCount.nonpaye / total) * 100

    const radius = 40
    const circumference = 2 * Math.PI * radius

    let offset = 0
    const soldeOffset = offset
    offset += (soldePercent / 100) * circumference

    const encourOffset = offset
    offset += (encourPercent / 100) * circumference

    const nonpayeOffset = offset

    return (
      <div className="flex items-center justify-center gap-6">
        <svg width="120" height="120" viewBox="0 0 120 120" className="transform -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#374151" strokeWidth="20" />
          {soldePercent > 0 && (
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#22c55e"
              strokeWidth="20"
              strokeDasharray={circumference}
              strokeDashoffset={-soldeOffset}
              strokeLinecap="round"
            />
          )}
          {encourPercent > 0 && (
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#f97316"
              strokeWidth="20"
              strokeDasharray={circumference}
              strokeDashoffset={-encourOffset}
              strokeLinecap="round"
            />
          )}
          {nonpayePercent > 0 && (
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#ef4444"
              strokeWidth="20"
              strokeDasharray={circumference}
              strokeDashoffset={-nonpayeOffset}
              strokeLinecap="round"
            />
          )}
        </svg>

        <div className="space-y-2 text-xs">
          {statusCount.solde > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-gray-300">
                Soldé: <span className="font-semibold">{statusCount.solde}</span>
              </span>
            </div>
          )}
          {statusCount.encours > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-gray-300">
                En cours: <span className="font-semibold">{statusCount.encours}</span>
              </span>
            </div>
          )}
          {statusCount.nonpaye > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-gray-300">
                Non payé: <span className="font-semibold">{statusCount.nonpaye}</span>
              </span>
            </div>
          )}
          {statusCount.retard > 0 && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-600">
              <span className="animate-pulse">⚠️</span>
              <span className="text-red-300">
                Retard: <span className="font-semibold text-red-400">{statusCount.retard}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderTrustTab = () => {
    const stats = calculateStats()
    const clientsARelancer = clients
      .filter((client) => client.resteAPayer > 0)
      .sort((a, b) => calculatePaymentDelay(b) - calculatePaymentDelay(a))
      .slice(0, 5)
    const clientsIncoherents = clients.filter((client) => client.prix_total <= 0 && client.totalPaye > 0)

    return (
      <div className="pb-24 space-y-6">
        {/* === STATS HEADER === */}
        <div className="pt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">CA Global</p>
            <p className="text-xl font-bold text-white sm:text-2xl">{formatFCFA(stats.caGlobal)}</p>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-lg p-3 border-l-4 border-l-green-500">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Encaissé</p>
            <p className="text-xl font-bold text-green-400 sm:text-2xl">{formatFCFA(stats.totalEncaisse)}</p>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-lg p-3 border-l-4 border-l-orange-500">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">À Recouvrer</p>
            <p className="text-xl font-bold text-orange-400 sm:text-2xl">{formatFCFA(stats.resteRecouvrer)}</p>
          </div>
        </div>

        {clientsIncoherents.length > 0 && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
            <p className="font-semibold">Données à nettoyer avant déploiement</p>
            <p className="mt-1 text-yellow-100/80">
              {clientsIncoherents.length} client{clientsIncoherents.length > 1 ? 's ont' : ' a'} un montant total à 0 avec un paiement enregistré.
            </p>
          </div>
        )}

        {clientsARelancer.length > 0 && (
          <div className="rounded-lg border border-orange-500/30 bg-gradient-to-br from-gray-900 to-gray-800 p-4">
            <h3 className="mb-3 text-sm font-bold text-white">Clients à relancer</h3>
            <div className="space-y-2">
              {clientsARelancer.map((client) => (
                <div key={client.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-950/40 p-3 text-xs">
                  <button
                    onClick={() => {
                      setSelectedClient(client)
                      setShowClientProfile(true)
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate font-semibold text-white">{client.nom}</p>
                    <p className="text-gray-400">{formatFCFA(client.resteAPayer)} restant</p>
                  </button>
                  <a
                    href={getPaymentReminderUrl(client)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      if (!window.confirm(getPaymentReminderText(client))) event.preventDefault()
                    }}
                    className="shrink-0 rounded-md bg-green-600 px-3 py-2 font-semibold text-white transition hover:bg-green-500"
                  >
                    WhatsApp
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === CHARTS === */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-lg p-4">
            <h3 className="text-sm font-bold text-white mb-4">📊 Répartition Statuts Clients</h3>
            {renderPieChart()}
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-lg p-4">
            <h3 className="text-sm font-bold text-white mb-4">🎖️ Performance Ambassadeurs</h3>
            <div className="space-y-3">
              {Object.values(calculateAmbassadors())
                .filter((a) => a.nom !== 'Aucun' && a.clients > 0)
                .sort((a, b) => b.clients - a.clients)
                .slice(0, 5)
                .map((amb) => (
                  <div key={amb.nom}>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{amb.nom}</span>
                      <span className="text-blue-400 font-semibold">{amb.clients} clients</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${Math.min((amb.clients / 10) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* === SEARCH & ADD === */}
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Chercher un client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-4 py-3 pl-10 text-white placeholder-gray-500 focus:border-blue-500/50 focus:outline-none text-sm"
            />
            <span className="absolute left-3 top-3.5 text-gray-500">🔍</span>
          </div>

          <button
            onClick={() => {
              setFormError(null)
              setShowNewClientModal(true)
            }}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold py-3 rounded-lg transition-all duration-200 text-sm shadow-lg"
          >
            ➕ Nouveau Client
          </button>
        </div>

        {/* === CLIENT CARDS === */}
        <div className="grid gap-3 lg:grid-cols-2">
          {filteredClients.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">Aucun client trouvé</p>
            </div>
          ) : (
            filteredClients.map((client) => (
              <div
                key={client.id}
                onClick={() => {
                  setSelectedClient(client)
                  setShowClientProfile(true)
                }}
                className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-lg p-4 cursor-pointer hover:border-blue-500/50 transition"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold text-white text-sm">{client.nom}</h3>
                    <p className="text-xs text-gray-400">📱 {client.telephone}</p>
                    {calculatePaymentDelay(client) > 0 && (
                      <p className="text-xs text-red-400 font-semibold mt-1 animate-pulse">
                        ⚠️ Retard de {calculatePaymentDelay(client)} jours
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-blue-400">{client.progression.toFixed(0)}%</p>
                    <p className="text-xs text-gray-500">
                      {formatFCFA(client.totalPaye)} / {formatFCFA(client.prix_total)}
                    </p>
                  </div>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                    style={{ width: `${client.progression}%` }}
                  ></div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  const renderAmbassadorsTab = () => {
    const ambassadors = calculateAmbassadors()
    const sortedAmbs = Object.values(ambassadors)
      .filter((a) => a.nom !== 'Aucun')
      .sort((a, b) => b.commissions - a.commissions)

    const totalCommissions = sortedAmbs.reduce((sum, a) => sum + a.commissions, 0)
    const totalVerse = sortedAmbs.reduce((sum, a) => sum + a.verseTotal, 0)
    const totalReste = Math.max(0, totalCommissions - totalVerse)

    return (
      <div className="pb-24 space-y-4 pt-4">
        {/* === HEADER STATS === */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Commissions</p>
            <p className="text-lg font-bold text-purple-400">{formatFCFA(totalCommissions)}</p>
          </div>

          <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-lg p-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Reste à Verser</p>
            <p className="text-lg font-bold text-orange-400">{formatFCFA(totalReste)}</p>
          </div>
        </div>

        {/* === AMBASSADORS LIST === */}
        <div className="space-y-2">
          {sortedAmbs.map((amb, idx) => (
            <div key={amb.nom} className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                    #{idx + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{amb.nom}</p>
                    <p className="text-xs text-gray-400">
                      {amb.clients} client{amb.clients > 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-400">{formatFCFA(amb.commissions)}</p>
                  <p className="text-xs text-gray-500">Commissions</p>
                </div>
              </div>

              <div className="mb-3">
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    style={{
                      width: `${totalCommissions > 0 ? (amb.commissions / totalCommissions) * 100 : 0}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3 text-xs bg-gray-800/50 rounded p-2">
                <span className="text-gray-400">
                  Versé:{' '}
                  <span className="text-green-400 font-semibold">
                    {formatFCFA(amb.verseTotal)}
                  </span>{' '}
                </span>
                <span className="text-gray-400">
                  Reste:{' '}
                  <span className="text-orange-400 font-semibold">
                    {formatFCFA(amb.commissions - amb.verseTotal)}
                  </span>{' '}
                </span>
              </div>

              <button
                onClick={() => {
                  setSelectedAmb(amb.nom)
                  setShowAmbPaymentModal(amb.nom)
                  setFormError(null)
                }}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-semibold py-2 rounded text-xs transition"
              >
                💸 Enregistrer un Paiement
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ==================== MODALS ====================

  const renderNewClientModal = () => {
    if (!showNewClientModal) return null

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-gray-700/50 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Nouveau Client</h2>
            <button
              onClick={() => setShowNewClientModal(false)}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ✕
            </button>
          </div>

          {formError && (
            <div className="mb-4 bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-red-300 text-xs">
              {formError}
            </div>
          )}

          <form onSubmit={handleAddClient} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nom *</label>
              <input
                type="text"
                placeholder="Mamadou Traoré"
                value={newClientForm.nom}
                onChange={(e) => setNewClientForm({ ...newClientForm, nom: e.target.value })}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Téléphone *</label>
              <input
                type="tel"
                placeholder="0708091011"
                value={newClientForm.telephone}
                onChange={(e) =>
                  setNewClientForm({ ...newClientForm, telephone: e.target.value })
                }
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Montant Total (F CFA) *</label>
              <input
                type="number"
                placeholder="55000"
                value={newClientForm.prix_total}
                onChange={(e) =>
                  setNewClientForm({ ...newClientForm, prix_total: e.target.value })
                }
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
                min="0"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Date Estimée Livraison *</label>
              <input
                type="date"
                value={newClientForm.date_livraison}
                onChange={(e) =>
                  setNewClientForm({ ...newClientForm, date_livraison: e.target.value })
                }
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Ambassadeur</label>
              <select
                value={newClientForm.ambassadeur}
                onChange={(e) =>
                  setNewClientForm({ ...newClientForm, ambassadeur: e.target.value })
                }
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {AMBASSADEURS_LIST.map((amb) => (
                  <option key={amb} value={amb} className="bg-gray-900">
                    {amb}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowNewClientModal(false)}
                className="flex-1 bg-gray-700/50 hover:bg-gray-700/70 text-white font-semibold py-2 rounded-lg text-sm transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold py-2 rounded-lg text-sm disabled:opacity-50 transition"
              >
                {formLoading ? '⏳' : '✓'} Créer
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  const renderClientProfileModal = () => {
    if (!showClientProfile || !selectedClient) return null

    const statusColor = getStatusColor(selectedClient.statut)
    const clientPayments = paiements
      .filter((p) => p.client_id === selectedClient.id)
      .sort((a, b) => {
        const dateA = new Date(a.date_paiement || 0).getTime()
        const dateB = new Date(b.date_paiement || 0).getTime()
        return dateB - dateA
      })

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-gray-700/50 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">{selectedClient.nom}</h2>
              <p className="text-xs text-gray-400">📱 {selectedClient.telephone}</p>
            </div>
            <button
              onClick={() => {
                setShowClientProfile(false)
                setSelectedClient(null)
              }}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ✕
            </button>
          </div>

          <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/30 mb-4 flex justify-between items-center text-xs">
            <div>
              <p className="text-gray-400 mb-0.5">Statut de paiement</p>
              <p className={`font-semibold ${statusColor.color}`}>
                {statusColor.icon} {statusColor.label}
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-400 mb-0.5">Ambassadeur</p>
              <p className="font-semibold text-purple-400">{selectedClient.ambassadeur || 'Aucun'}</p>
            </div>
          </div>

          {calculatePaymentDelay(selectedClient) > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-xs text-red-400 flex items-center gap-2">
              <span>⚠️</span>
              <p>
                Retard de <span className="font-bold">{calculatePaymentDelay(selectedClient)} jours</span> détecté (rythme max exigé : 7j).
              </p>
            </div>
          )}

          {/* Evolution / Barre */}
          <div className="bg-gray-800/20 border border-gray-800 rounded-xl p-4 mb-5 space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Progression</span>
              <span className="text-blue-400 font-bold">{selectedClient.progression.toFixed(0)}%</span>
            </div>
            <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500"
                style={{ width: `${selectedClient.progression}%` }}
              ></div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs border-t border-gray-800">
              <div>
                <p className="text-gray-500">Total Dû</p>
                <p className="font-semibold text-white">{formatFCFA(selectedClient.prix_total)}</p>
              </div>
              <div>
                <p className="text-gray-500">Payé</p>
                <p className="font-semibold text-green-400">{formatFCFA(selectedClient.totalPaye)}</p>
              </div>
              <div>
                <p className="text-gray-500">Reste</p>
                <p className="font-semibold text-orange-400">{formatFCFA(selectedClient.resteAPayer)}</p>
              </div>
            </div>
          </div>

          {/* Formulaire de Versement Vite fait */}
          {selectedClient.statut !== 'Soldé' && (
            <div className="border border-gray-800 bg-gray-900/30 rounded-xl p-4 mb-5">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">💰 Ajouter un versement</h3>
              <form onSubmit={handleAddPayment} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Montant (F CFA)"
                    value={newPaymentForm.montant}
                    onChange={(e) => setNewPaymentForm({ ...newPaymentForm, montant: e.target.value })}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-blue-500"
                    min="1"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Note (Wave, Orange, Cash)"
                    value={newPaymentForm.commentaire}
                    onChange={(e) => setNewPaymentForm({ ...newPaymentForm, commentaire: e.target.value })}
                    className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 rounded-lg text-xs transition disabled:opacity-50"
                >
                  {formLoading ? '⏳ Enregistrement...' : 'Confirmer le versement'}
                </button>
              </form>
            </div>
          )}

          {/* Historique des paiements */}
          <div className="mb-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">📜 Historique des versements</h3>
            {clientPayments.length === 0 ? (
              <p className="text-xs text-gray-500 italic text-center py-2">Aucun versement effectué</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {clientPayments.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPayment(p)
                      setShowReceiptModal(true)
                    }}
                    className="bg-gray-800/30 hover:bg-gray-800/60 border border-gray-800 rounded-lg p-2.5 flex justify-between items-center text-xs transition cursor-pointer"
                  >
                    <div>
                      <p className="font-bold text-green-400">+{formatFCFA(p.montant)}</p>
                      <p className="text-[10px] text-gray-500">
                        {p.date_paiement ? new Date(p.date_paiement).toLocaleDateString('fr-FR') : 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      {p.commentaire && <p className="text-gray-300 italic text-[11px] mb-1">{p.commentaire}</p>}
                      <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">🧾 Reçu</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-800 text-xs">
            {selectedClient.resteAPayer > 0 && (
              <a
                href={getPaymentReminderUrl(selectedClient)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  if (!window.confirm(getPaymentReminderText(selectedClient))) event.preventDefault()
                }}
                className="col-span-2 flex items-center justify-center bg-green-600 hover:bg-green-500 text-white font-semibold py-2 rounded-lg transition"
              >
                💬 Envoyer un rappel WhatsApp
              </a>
            )}
            <button
              onClick={() => setShowNewCommandeModal(true)}
              className="bg-gray-800 hover:bg-gray-700 border border-gray-700/50 text-white font-medium py-2 rounded-lg transition"
            >
              🛍️ Nouvelle Commande
            </button>
            <button
              onClick={() => handleDeleteClient(selectedClient.id)}
              className="bg-red-950/40 hover:bg-red-900/40 border border-red-900/30 text-red-400 font-medium px-3 py-2 rounded-lg transition"
            >
              🗑️ Supprimer
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderNewCommandeModal = () => {
    if (!showNewCommandeModal || !selectedClient) return null

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-55 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-gray-700/50 rounded-2xl w-full max-w-xs p-5 shadow-2xl">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-white">🛍️ Complément Commande</h3>
            <button onClick={() => setShowNewCommandeModal(false)} className="text-gray-400 hover:text-white">✕</button>
          </div>

          <form onSubmit={handleAddCommande} className="space-y-3">
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Prix du nouvel article (F CFA)</label>
              <input
                type="number"
                placeholder="Ex: 35000"
                value={newCommandeForm.montant}
                onChange={(e) => setNewCommandeForm({ ...newCommandeForm, montant: e.target.value })}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                required
              />
            </div>
            <div className="flex gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => setShowNewCommandeModal(false)}
                className="flex-1 bg-gray-800 text-gray-300 py-1.5 rounded"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-blue-600 text-white font-semibold py-1.5 rounded disabled:opacity-50"
              >
                {formLoading ? '⏳' : 'Ajouter'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  const renderAmbPaymentModal = () => {
    if (!showAmbPaymentModal || !selectedAmb) return null

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border border-gray-700/50 rounded-2xl w-full max-w-xs p-5 shadow-2xl">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-bold text-white">💸 Verser à {selectedAmb}</h3>
            <button onClick={() => { setShowAmbPaymentModal(null); setSelectedAmb(null); }} className="text-gray-400 hover:text-white">✕</button>
          </div>

          <form onSubmit={handleAddAmbassadorPayment} className="space-y-3">
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">Montant à transférer (F CFA)</label>
              <input
                type="number"
                placeholder="Ex: 5000"
                value={ambPaymentForm.montant}
                onChange={(e) => setAmbPaymentForm({ ...ambPaymentForm, montant: e.target.value })}
                className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-green-500"
                required
              />
            </div>
            <div className="flex gap-2 text-xs pt-1">
              <button
                type="button"
                onClick={() => { setShowAmbPaymentModal(null); setSelectedAmb(null); }}
                className="flex-1 bg-gray-800 text-gray-300 py-1.5 rounded"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-green-600 text-white font-semibold py-1.5 rounded disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  const renderReceiptModal = () => {
    if (!showReceiptModal || !selectedPayment || !selectedClient) return null

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-55 flex items-center justify-center p-4">
        <div className="bg-white text-gray-900 rounded-xl w-full max-w-xs p-5 shadow-2xl font-mono text-xs relative border-4 border-double border-gray-300">
          <button
            onClick={() => {
              setShowReceiptModal(false)
              setSelectedPayment(null)
            }}
            className="absolute top-2 right-3 text-gray-500 hover:text-gray-900 text-lg print:hidden"
          >
            ✕
          </button>

          <div className="text-center space-y-1 pb-3 border-b border-dashed border-gray-400">
            <h2 className="text-base font-bold tracking-wider">THE TRUST</h2>
            <p className="text-[9px] text-gray-500 leading-none">Sneakers & Vêtements par Tempérament</p>
            <p className="text-[10px]">Abidjan, Côte d&apos;Ivoire</p>
          </div>

          <div className="py-3 space-y-1 border-b border-dashed border-gray-400 text-[11px]">
            <p className="font-bold text-center mb-1">REÇU DE VERSEMENT</p>
            <p><span className="text-gray-500">Client:</span> {selectedClient.nom}</p>
            <p><span className="text-gray-500">Tel:</span> {selectedClient.telephone}</p>
            <p><span className="text-gray-500">Date:</span> {selectedPayment.date_paiement ? new Date(selectedPayment.date_paiement).toLocaleString('fr-FR') : 'N/A'}</p>
          </div>

          <div className="py-3 space-y-1">
            <div className="flex justify-between font-bold text-sm">
              <span>VERSÉ :</span>
              <span>{formatFCFA(selectedPayment.montant)}</span>
            </div>
            {selectedPayment.commentaire && (
              <p className="text-gray-600 italic mt-1 text-[10px]">Note : {selectedPayment.commentaire}</p>
            )}
          </div>

          <div className="pt-3 border-t border-dashed border-gray-400 space-y-1 text-[11px] text-gray-700 bg-gray-50 p-2 rounded">
            <div className="flex justify-between">
              <span>Total Commande :</span>
              <span>{formatFCFA(selectedClient.prix_total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Déjà Réglé :</span>
              <span>{formatFCFA(selectedClient.totalPaye)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200">
              <span>Reste à Payer :</span>
              <span>{formatFCFA(selectedClient.resteAPayer)}</span>
            </div>
          </div>

          <div className="text-center pt-4 print:hidden">
            <button
              onClick={() => window.print()}
              className="w-full bg-gray-950 text-white font-bold py-2 rounded shadow hover:bg-gray-800 transition text-[11px]"
            >
              🖨️ Imprimer / PDF
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ==================== MAIN RENDER ====================

  return (
    <div className="min-h-screen bg-gray-950 text-slate-100 antialiased selection:bg-blue-500/30">
      {/* Header */}
      <header className="sticky top-0 bg-gray-900/80 backdrop-blur-md border-b border-gray-800/80 z-40">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            The Trust Dashboard
          </h1>
          {error && <span className="text-xs text-red-400">⚠️ {error}</span>}
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-3">
            <span className="text-2xl animate-spin">⏳</span>
            <p className="text-sm text-gray-400">Chargement des comptes...</p>
          </div>
        ) : activeTab === 'trust' ? (
          renderTrustTab()
        ) : (
          renderAmbassadorsTab()
        )}
      </main>

      {/* Barre de navigation basse pour le côté mobile */}
      <nav className="fixed bottom-0 left-0 right-0 mx-auto flex w-full max-w-6xl justify-around border-t border-gray-800 bg-gray-900/90 px-6 py-2 shadow-2xl backdrop-blur-lg z-40 sm:rounded-t-xl">
        <button
          onClick={() => setActiveTab('trust')}
          className={`flex flex-col items-center space-y-1 text-xs font-medium py-1 transition ${
            activeTab === 'trust' ? 'text-blue-400 font-bold' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <span className="text-lg">👟</span>
          <span>The Trust</span>
        </button>
        <button
          onClick={() => setActiveTab('ambassadeurs')}
          className={`flex flex-col items-center space-y-1 text-xs font-medium py-1 transition ${
            activeTab === 'ambassadeurs' ? 'text-purple-400 font-bold' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <span className="text-lg">🎖️</span>
          <span>Ambassadeurs</span>
        </button>
      </nav>

      {/* Modals Injection */}
      {renderNewClientModal()}
      {renderClientProfileModal()}
      {renderNewCommandeModal()}
      {renderAmbPaymentModal()}
      {renderReceiptModal()}
    </div>
  )
}
