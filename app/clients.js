'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function GestionClients({ onBack }) {
  const [clients, setClients] = useState([])
  const [paiements, setPaiements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // États pour les Modals
  const [selectedClient, setSelectedClient] = useState(null)
  const [isProfilOpen, setIsProfilOpen] = useState(false)
  const [isPayOpen, setIsPayOpen] = useState(false)

  // Formulaire Nouveau Client
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [ambassadeur, setAmbassadeur] = useState('')
  const [piece, setPiece] = useState('')
  const [dateLivraison, setDateLivraison] = useState('')

  // Formulaire Nouveau Paiement
  const [montantPaye, setMontantPaye] = useState('')
  const [dateEcheance, setDateEcheance] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [methode, setMethode] = useState('Orange Money')

  // 1. Chargement des données (Garanti sans created_at)
  async function refreshData() {
    try {
      setLoading(true)
      setError(null)

      const { data: cData, error: cErr } = await supabase
        .from('clients')
        .select('id, nom, telephone, ambassadeur, pieces_identite, date_livraison')

      const { data: pData, error: pErr } = await supabase
        .from('paiements')
        .select('id, client_id, montant, date_paiement, date_echeance, commentaire, methode')

      if (cErr || pErr) {
        setError(cErr?.message || pErr?.message || "Erreur de chargement.")
        return
      }

      setClients(cData || [])
      setPaiements(pData || [])
    } catch (err) {
      setError(err.message || "Une erreur est survenue.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshData()
  }, [])

  // 2. Ajouter un client
  async function handleAddClient(e) {
    e.preventDefault()
    if (!nom || !telephone) return

    const { error: insErr } = await supabase
      .from('clients')
      .insert([{
        nom,
        telephone,
        ambassadeur: ambassadeur || null,
        pieces_identite: piece || null,
        date_livraison: dateLivraison || null
      }])

    if (insErr) {
      alert("Erreur lors de l'ajout : " + insErr.message)
    } else {
      setNom('')
      setTelephone('')
      setAmbassadeur('')
      setPiece('')
      setDateLivraison('')
      refreshData()
    }
  }

  // 3. Ajouter un versement
  async function handleAddPaiement(e) {
    e.preventDefault()
    if (!selectedClient || !montantPaye) return

    const { error: insErr } = await supabase
      .from('paiements')
      .insert([{
        client_id: selectedClient.id,
        montant: parseFloat(montantPaye),
        date_paiement: new Date().toISOString().split('T')[0],
        date_echeance: dateEcheance || null,
        commentaire: commentaire || null,
        methode
      }])

    if (insErr) {
      alert("Erreur paiement : " + insErr.message)
    } else {
      setMontantPaye('')
      setDateEcheance('')
      setCommentaire('')
      setIsPayOpen(false)
      refreshData()
    }
  }

  // 4. Supprimer un client
  async function handleDeleteClient(id) {
    if (!confirm("Supprimer ce client et tout son historique de paiement ?")) return

    await supabase.from('paiements').delete().eq('client_id', id)
    const { error: delErr } = await supabase.from('clients').delete().eq('id', id)

    if (delErr) alert(delErr.message)
    else refreshData()
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-white">
        <p className="text-xl font-semibold animate-pulse">Synchronisation portefeuille...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <button onClick={onBack} className="text-emerald-400 hover:underline mb-6 flex items-center gap-2 text-sm">
        ← Retour au Tableau de bord
      </button>

      <h1 className="text-3xl font-black text-white mb-8">Portefeuille Clients - THE TRUST</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-red-400 mb-6 text-sm">
          <strong>⚠️ Erreur :</strong> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulaire d'ajout */}
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl h-fit shadow-xl">
          <h2 className="text-xl font-bold text-white mb-4">Nouveau Profil</h2>
          <form onSubmit={handleAddClient} className="space-y-4">
            <input type="text" placeholder="Nom Complet *" value={nom} onChange={e => setNom(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" required />
            <input type="text" placeholder="Téléphone (WhatsApp) *" value={telephone} onChange={e => setTelephone(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" required />
            <input type="text" placeholder="Ambassadeur" value={ambassadeur} onChange={e => setAmbassadeur(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" />
            <input type="text" placeholder="Pièce d'Identité" value={piece} onChange={e => setPiece(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" />
            <div>
              <label className="text-xs text-gray-400 block mb-1">Date de livraison</label>
              <input type="date" value={dateLivraison} onChange={e => setDateLivraison(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm text-gray-300 outline-none" />
            </div>
            <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-gray-950 font-bold py-3 rounded-xl transition text-sm">
              Créer la fiche client
            </button>
          </form>
        </div>

        {/* Tableau de la liste */}
        <div className="lg:grid-cols-1 lg:col-span-2 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-gray-800"><h2 className="text-xl font-bold text-white">Liste des Comptes</h2></div>
          {clients.length === 0 ? (
            <p className="text-gray-500 text-center py-12">Aucun client enregistré pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-950 text-gray-400 border-b border-gray-800">
                    <th className="p-4">Nom</th>
                    <th className="p-4">Téléphone</th>
                    <th className="p-4">Livré le</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {clients.map(c => (
                    <tr key={c.id} className="hover:bg-gray-800/30 transition">
                      <td className="p-4 font-semibold text-white">{c.nom}</td>
                      <td className="p-4 text-gray-300">{c.telephone}</td>
                      <td className="p-4 text-gray-400">{c.date_livraison || '-'}</td>
                      <td className="p-4 text-right space-x-2">
                        <button type="button" onClick={() => { setSelectedClient(c); setIsProfilOpen(true); }} className="px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-xs font-semibold hover:bg-blue-500/20">📁 Profil</button>
                        <button type="button" onClick={() => { setSelectedClient(c); setIsPayOpen(true); }} className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs font-semibold hover:bg-emerald-500/20">💵 +Paye</button>
                        <button type="button" onClick={() => handleDeleteClient(c.id)} className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-xs font-semibold hover:bg-red-500/20">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1 : HISTORIQUE ET PROFIL CLIENT */}
      {isProfilOpen && selectedClient && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl relative">
            <h3 className="text-2xl font-black text-white mb-2">{selectedClient.nom}</h3>
            <p className="text-sm text-gray-400 mb-6">Fiche d'information complète</p>
            <div className="space-y-2 bg-gray-950 p-4 rounded-xl border border-gray-800 text-sm mb-6">
              <p><span className="text-gray-500">Contact :</span> {selectedClient.telephone}</p>
              <p><span className="text-gray-500">Ambassadeur :</span> {selectedClient.ambassadeur || 'Aucun'}</p>
              <p><span className="text-gray-500">Pièce ID :</span> {selectedClient.pieces_identite || 'Non fournie'}</p>
            </div>
            <h4 className="font-bold text-white mb-3">Versements validés</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto mb-6">
              {paiements.filter(p => p.client_id === selectedClient.id).length === 0 ? (
                <p className="text-xs text-gray-500">Aucun versement enregistré.</p>
              ) : (
                paiements.filter(p => p.client_id === selectedClient.id).map(p => (
                  <div key={p.id} className="bg-gray-950 border border-gray-800 p-3 rounded-lg flex justify-between text-xs">
                    <div>
                      <p className="text-emerald-400 font-bold">{p.montant.toLocaleString()} F CFA</p>
                      <p className="text-gray-500">{p.methode} • {p.commentaire || 'Aucun mot'}</p>
                    </div>
                    <span className="text-gray-400">{p.date_paiement}</span>
                  </div>
                ))
              )}
            </div>
            <button type="button" onClick={() => setIsProfilOpen(false)} className="w-full bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm font-semibold">Fermer</button>
          </div>
        </div>
      )}

      {/* MODAL 2 : AJOUTER UN PAIEMENT */}
      {isPayOpen && selectedClient && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-1">Enregistrer un versement</h3>
            <p className="text-xs text-gray-400 mb-4">Pour : {selectedClient.nom}</p>
            <form onSubmit={handleAddPaiement} className="space-y-4">
              <input type="number" placeholder="Montant du versement (F CFA) *" value={montantPaye} onChange={e => setMontantPaye(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" required />
              <select value={methode} onChange={e => setMethode(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm text-white outline-none">
                <option value="Orange Money">Orange Money</option>
                <option value="Wave">Wave</option>
                <option value="Moov Money">Moov Money</option>
                <option value="Espèces">Espèces</option>
              </select>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Prochaine Échéance (Optionnel)</label>
                <input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm text-gray-300 outline-none" />
              </div>
              <input type="text" placeholder="Commentaire / Note (ex: Échéance 2)" value={commentaire} onChange={e => setCommentaire(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsPayOpen(false)} className="w-1/2 bg-gray-800 hover:bg-gray-700 py-3 rounded-xl text-sm font-semibold">Annuler</button>
                <button type="submit" className="w-1/2 bg-emerald-500 hover:bg-emerald-600 text-gray-950 font-bold py-3 rounded-xl text-sm">Confirmer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}