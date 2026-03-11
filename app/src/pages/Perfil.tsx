import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { doc, updateDoc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'
import { UserCircle, Camera, Save, Loader2, Mail, Phone, User, Shield } from 'lucide-react'

export function Perfil() {
  const { user, isAdmin, refreshUser } = useAuth()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [fotoUrl, setFotoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    const loadPerfil = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid))
        if (snap.exists()) {
          const d = snap.data()
          setNome(d.nome || '')
          setEmail(d.email || user.email || '')
          setTelefone(d.telefone || '')
          setFotoUrl(d.foto_url || '')
        }
      } catch (e) { console.error(e) }
    }
    loadPerfil()
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        nome: nome.trim(),
        telefone: telefone.trim(),
        updated_at: new Date(),
      })
      await refreshUser()
      toast.success('Perfil atualizado com sucesso!')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao salvar perfil')
    } finally {
      setSaving(false)
    }
  }

  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagem deve ter menos de 2MB'); return }
    setUploadingFoto(true)
    try {
      // Convert to base64 and store directly in Firestore (avoids Storage CORS)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await updateDoc(doc(db, 'users', user.uid), { foto_url: base64 })
      setFotoUrl(base64)
      await refreshUser()
      toast.success('Foto atualizada!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao enviar foto')
    } finally {
      setUploadingFoto(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Meu Perfil</h1>
        <p className="text-gray-500 text-sm mt-0.5">Gerencie suas informações pessoais</p>
      </div>

      {/* Foto de perfil */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <Camera className="w-4 h-4 text-[#C9A227]" /> Foto de Perfil
        </h2>
        <div className="flex items-center gap-6">
          <div className="relative">
            {fotoUrl ? (
              <img
                src={fotoUrl}
                alt={nome}
                className="w-24 h-24 rounded-full object-cover border-2 border-[#C9A227]/30"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#C9A227] to-[#9A7B1A] flex items-center justify-center">
                <span className="text-white text-2xl font-bold">
                  {nome?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '?'}
                </span>
              </div>
            )}
            {uploadingFoto && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingFoto}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              {uploadingFoto ? 'Enviando...' : 'Alterar foto'}
            </button>
            <p className="text-xs text-gray-400 mt-1.5">JPG, PNG ou WEBP. Máx. 2MB</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFotoChange} />
        </div>
      </div>

      {/* Dados pessoais */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <User className="w-4 h-4 text-[#C9A227]" /> Dados Pessoais
        </h2>

        {/* Role badge */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${isAdmin ? 'bg-[#C9A227]/15 text-[#9A7B1A]' : 'bg-blue-100 text-blue-700'}`}>
            <Shield className="w-3 h-3" />
            {isAdmin ? 'Administrador' : 'Vendedor'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"
              placeholder="Seu nome"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Email
            </label>
            <input
              value={email}
              readOnly
              className="w-full px-4 py-2.5 rounded-xl border border-gray-100 text-gray-500 bg-gray-50 cursor-not-allowed"
              placeholder="email@exemplo.com"
            />
            <p className="text-xs text-gray-400 mt-1">O email não pode ser alterado aqui</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> Telefone / WhatsApp
            </label>
            <input
              value={telefone}
              onChange={e => setTelefone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-[#C9A227]"
              placeholder="(555) 000-0000"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#C9A227] text-white font-medium text-sm hover:bg-[#b8911f] disabled:opacity-60 transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>

      {/* Acesso ao sistema */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <UserCircle className="w-4 h-4 text-[#C9A227]" /> Acesso ao Sistema
        </h2>
        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Email de login</span>
            <span className="font-medium text-gray-800">{email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Nível de acesso</span>
            <span className={`font-semibold ${isAdmin ? 'text-[#C9A227]' : 'text-blue-600'}`}>
              {isAdmin ? 'Administrador' : 'Vendedor'}
            </span>
          </div>
        </div>
        {!isAdmin && (
          <p className="text-xs text-gray-400 mt-3">
            Para alterar sua senha, solicite ao administrador do sistema.
          </p>
        )}
      </div>
    </div>
  )
}
