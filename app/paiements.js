'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function GestionPaiements({ onBack }) {
  const [clientId, setClientId] = useState('')
  const [montant, setMontant] = useState('')
  const [methode, setMethode] = useState('Wave')
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().split('T')[0])
  const [dateEcheance, setDateEcheance] = useState('')
  const [commentaire, setCommentaire] = useState('')

  const [clients, setClients] = useState([])
  const [paiements, setPaiements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Charger les données initiales (clients pour le select + liste des paiements)
  async function loadData() {
    setLoading(true)
    
    // 1. Récupérer les clients pour la liste déroulante
    const { data: cData } = await supabase.from('clients').select('id, nom').order('nom')
    if (cData) setClients(cData)

    // 2. Récupérer l'historique des paiements avec le nom du client joint
    const { data: pData } = await supabase
      .from('paiements')
      .select(`
        id,
        montant,
        methode,
        date_paiement,
        date_echeance,
        commentaire,
        client_id ( nom )
      `)
      .order('date_paiement', { ascending: false })
    
    if (pData) setPaiements(pData)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Soumission du paiement
  async function handleSubmit(e) {
    e.preventDefault()
    if (!clientId || !montant || !datePaiement) return alert('Veuillez remplir les champs obligatoires (*)')

    setSaving(true)
    const { error } = await supabase.from('paiements').insert([
      {
        client_id: clientId,
        montant: Number(montant),
        methode,
        date_paiement: datePaiement,
        date_echeance: dateEcheance || null,
        commentaire: commentaire || null
      }
    ])

    setSaving(false)
    if (error) {
      alert("Erreur lors du paiement : " + error.message)
    } else {
      // Réinitialiser le formulaire
      setClientId('')
      setMontant('')
      setCommentaire('')
      setDateEcheance('')
      loadData() // Recharger le tableau
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      {/* Retour */}
      <button 
        onClick={onBack}
        className="mb-6 text-sm text-gray-400 hover:text-white flex items-center gap-2 transition"
      >
        ← Retour au Tableau de bord
      </button>

      <h1 className="text-3xl font-extrabold text-white mb-8">Registre des Encaisses & Paiements</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulaire de paiement */}
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl h-fit">
          <h2 className="text-xl font-bold text-white mb-6">Enregistrer un versement</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sélectionner le Client *</label>
              <select 
                value={clientId} onChange={e => setClientId(e.target.value)} required
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
              >
                <option value="">-- Choisir un client --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Montant du Versement (F CFA) *</label>
              <input 
                type="number" value={montant} onChange={e => setMontant(e.target.value)}
                placeholder="Ex: 15000" required
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Canal / Méthode de paiement *</label>
              <select 
                value={methode} onChange={e => setMethode(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
              >
                <option value="Wave">Wave</option>
                <option value="Orange Money">Orange Money</option>
                <option value="Moov Money">Moov Money</option>
                <option value="Espèces">Espèces</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Date du versement *</label>
              <input 
                type="date" value={datePaiement} onChange={e => setDatePaiement(e.target.value)} required
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition text-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Prochaine Échéance (Deadline facultative)</label>
              <input 
                type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition text-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Commentaire / Libellé</label>
              <input 
                type="text" value={commentaire} onChange={e => setCommentaire(e.target.value)}
                placeholder="Ex: 1er versement - Air Force 1"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <button 
              type="submit" disabled={saving}
              className="w-full bg-emerald-500 hover:bg-emerald-600 font-bold text-gray-950 py-3 rounded-xl transition mt-2 disabled:opacity-50"
            >
              {saving ? "Validation..." : "Valider l'Encaissement"}
            </button>
          </form>
        </div>

        {/* Historique des flux financiers */}
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
          <h2 className="text-xl font-bold text-white mb-6">Flux Récurrents & Historique</h2>

          {loading ? (
            <p className="text-gray-400 animate-pulse text-center py-8">Chargement de l'historique...</p>
          ) : paiements.length === 0 ? (
            <p className="text-gray-500 text-center py-8 border border-dashed border-gray-800 rounded-xl">Aucun versement enregistré.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="pb-3">Client</th>
                    <th className="pb-3">Montant</th>
                    <th className="pb-3">Méthode</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50 text-sm">
                  {paiements.map(p => (
                    <tr key={p.id} className="hover:bg-gray-950/40 transition">
                      <td className="py-3.5 font-medium text-white">{p.client_id?.nom || 'Client supprimé'}</td>
                      <td className="py-3.5 text-emerald-400 font-bold">{Number(p.montant).toLocaleString()} F CFA</td>
                      <td className="py-3.5">
                        <span className="bg-gray-950 border border-gray-800 text-gray-300 text-xs px-2 py-1 rounded font-medium">
                          {p.methode}
                        </span>
                      </td>
                      <td className="py-3.5 text-gray-400">{p.date_paiement}</td>
                      <td className="py-3.5 text-gray-500 text-xs truncate max-w-[150px]">{p.commentaire || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}