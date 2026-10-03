import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  AlertTriangle, ArrowDownToLine, Bell, Check, ChevronDown, CircleHelp,
  Cloud, CloudOff, Edit3, FileSpreadsheet, LayoutDashboard, LoaderCircle,
  Package, Plus, Search, Smartphone, Trash2, Upload, X,
} from 'lucide-react'

type Product = {
  id: string
  model: string
  sku: string
  category: string
  stock: number
  min_stock: number
  updated_at: string
}
type ProductInput = Omit<Product, 'id' | 'updated_at'>
type Filter = 'todos' | 'bajo' | 'agotado'

const STORAGE_KEY = 'smart-inven-products-v1'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
const sampleProducts: Product[] = []
const freshId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
const numberValue = (value: unknown, fallback = 0) => {
  const n = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}
const isLow = (p: Product) => p.stock <= 1

function readLocal(): Product[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) as Product[] : sampleProducts
  } catch {
    return sampleProducts
  }
}

function normalizeHeader(value: unknown) {
  return String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function mapSpreadsheetRow(row: Record<string, unknown>): ProductInput | null {
  const entries = Object.entries(row)
  const find = (terms: string[]) => entries.find(([key]) => terms.some(term => normalizeHeader(key).includes(term)))?.[1]
  const model = find(['modelo', 'model', 'pantalla', 'producto', 'articulo', 'descripcion', 'nombre', 'item'])
  if (model === undefined || String(model).trim() === '') return null
  return {
    model: String(model).trim(),
    sku: String(find(['sku', 'codigo', 'clave', 'ref']) ?? '').trim(),
    category: String(find(['categoria', 'tipo', 'marca']) ?? 'Pantallas').trim() || 'Pantallas',
    stock: Math.max(0, numberValue(find(['stock', 'existencia', 'cantidad', 'disponible', 'inventario']), 0)),
    min_stock: Math.max(0, numberValue(find(['minimo', 'minimo de stock', 'stock minimo']), 1)),
  }
}

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [notice, setNotice] = useState('')
  const [cloudError, setCloudError] = useState(false)
  const [authReady, setAuthReady] = useState(!supabase)
  const [userEmail, setUserEmail] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginMessage, setLoginMessage] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<ProductInput>({ model: '', sku: '', category: 'Pantallas', stock: 0, min_stock: 1 })

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? '')
      setAuthReady(true)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? '')
      setAuthReady(true)
      if (!session) setProducts([])
    })
    return () => authListener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) {
        if (active) { setProducts(readLocal()); setLoading(false) }
        return
      }
      if (!userEmail) {
        if (active) { setProducts([]); setLoading(false) }
        return
      }
      const { data, error } = await supabase.from('products').select('*').order('model')
      if (!active) return
      if (error) {
        setCloudError(true)
        setProducts(readLocal())
        setNotice('No se pudo conectar a la nube; se muestran los datos guardados en este dispositivo.')
      } else {
        setProducts((data ?? []) as Product[])
      }
      setLoading(false)
    }
    void load()
    if (supabase) {
      const channel = supabase.channel('products-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
        const { data, error } = await supabase!.from('products').select('*').order('model')
        if (!error && data) setProducts(data as Product[])
      }).subscribe()
      return () => { active = false; void supabase!.removeChannel(channel) }
    }
    return () => { active = false }
  }, [userEmail])

  useEffect(() => {
    if (!supabase || cloudError) localStorage.setItem(STORAGE_KEY, JSON.stringify(products))
  }, [products, cloudError])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function sendLoginLink(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !loginEmail.trim()) return
    setLoginBusy(true)
    setLoginMessage('')
    const { error } = await supabase.auth.signInWithOtp({ email: loginEmail.trim(), options: { emailRedirectTo: window.location.origin + window.location.pathname } })
    setLoginBusy(false)
    setLoginMessage(error ? `No se pudo enviar el enlace: ${error.message}` : 'Te enviamos un enlace de acceso. Ábrelo desde este dispositivo para entrar.')
  }

  const lowProducts = useMemo(() => products.filter(isLow), [products])
  const outCount = useMemo(() => products.filter(p => p.stock === 0).length, [products])
  const visibleProducts = useMemo(() => products
    .filter(p => filter === 'todos' || (filter === 'bajo' && isLow(p)) || (filter === 'agotado' && p.stock === 0))
    .filter(p => `${p.model} ${p.sku} ${p.category}`.toLowerCase().includes(query.toLowerCase().trim()))
    .sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || a.model.localeCompare(b.model, 'es')),
  [products, filter, query])

  if (supabase && (!authReady || !userEmail)) {
    return <div className="login-screen"><form className="login-card" onSubmit={sendLoginLink}><span className="brand-mark login-mark"><Smartphone size={23} /></span><div className="eyebrow">SMART INVEN</div><h1>Accede a tu inventario</h1><p>Inicia sesión con tu correo para sincronizar existencias entre tus dispositivos.</p><label>Correo electrónico<input required type="email" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} placeholder="tu@correo.com" /></label><button className="button button-primary" type="submit" disabled={loginBusy}>{loginBusy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{loginBusy ? 'Enviando enlace...' : 'Enviar enlace de acceso'}</button>{loginMessage && <div className="login-message" role="status">{loginMessage}</div>}<small>El enlace es de un solo uso. Cada dispositivo debe iniciar sesión con el mismo correo.</small></form></div>
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault()
    const clean = { ...form, model: form.model.trim(), sku: form.sku.trim(), category: form.category.trim() || 'Pantallas' }
    if (!clean.model) return
    if (supabase && !cloudError) {
      const result = editing
        ? await supabase.from('products').update({ ...clean, updated_at: new Date().toISOString() }).eq('id', editing.id)
        : await supabase.from('products').insert(clean)
      if (result.error) {
        setCloudError(true)
        setNotice(`No se pudo guardar en la nube: ${result.error.message}`)
        return
      }
      const { data } = await supabase.from('products').select('*').order('model')
      if (data) setProducts(data as Product[])
    } else if (editing) {
      setProducts(items => items.map(item => item.id === editing.id ? { ...item, ...clean, updated_at: new Date().toISOString() } : item))
    } else {
      setProducts(items => [...items, { ...clean, id: freshId(), updated_at: new Date().toISOString() }])
    }
    setModalOpen(false)
    setEditing(null)
    setNotice(editing ? 'Producto actualizado.' : 'Modelo agregado al inventario.')
  }

  function openCreate() {
    setEditing(null)
    setForm({ model: '', sku: '', category: 'Pantallas', stock: 0, min_stock: 1 })
    setModalOpen(true)
  }
  function openEdit(product: Product) {
    setEditing(product)
    setForm({ model: product.model, sku: product.sku ?? '', category: product.category ?? 'Pantallas', stock: product.stock, min_stock: product.min_stock ?? 1 })
    setModalOpen(true)
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`¿Eliminar ${product.model} del inventario?`)) return
    if (supabase && !cloudError) {
      const { error } = await supabase.from('products').delete().eq('id', product.id)
      if (error) { setNotice(`No se pudo eliminar: ${error.message}`); return }
    }
    setProducts(items => items.filter(item => item.id !== product.id))
    setNotice('Producto eliminado.')
  }

  async function importExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const sheet = workbook.worksheets[0]
      if (!sheet) { setNotice('El archivo no contiene hojas de cálculo.'); return }
      const modelHeaders = ['modelo', 'model', 'pantalla', 'producto', 'articulo', 'descripcion', 'nombre', 'item']
      const headerRowNumber = Array.from({ length: Math.min(sheet.rowCount, 10) }, (_, index) => index + 1)
        .find(rowNumber => (sheet.getRow(rowNumber).values as unknown[]).some(value => modelHeaders.some(term => normalizeHeader(value).includes(term))))
      if (!headerRowNumber) {
        setNotice('No encontré encabezados de modelo/producto en las primeras filas del Excel.')
        return
      }
      const headers = sheet.getRow(headerRowNumber).values as unknown[]
      const rows = Array.from({ length: Math.max(0, sheet.rowCount - headerRowNumber) }, (_, index) => {
        const values = sheet.getRow(headerRowNumber + index + 1).values as unknown[]
        const entries = Array.from({ length: sheet.columnCount }, (_, column) => [String(headers[column + 1] ?? ''), values[column + 1] ?? ''] as [string, unknown]).filter(([header]) => header.length > 0)
        return Object.fromEntries(entries)
      })
      const imported = rows.map(mapSpreadsheetRow).filter((row): row is ProductInput => row !== null)
      if (!imported.length) {
        setNotice('No encontré una columna de modelo/producto. Revisa que la primera fila tenga encabezados como Modelo y Stock.')
        return
      }
      const newProducts: Product[] = imported.map(item => ({ ...item, id: freshId(), updated_at: new Date().toISOString() }))
      if (supabase && !cloudError) {
        const { error } = await supabase.from('products').insert(imported)
        if (error) { setNotice(`Error al importar: ${error.message}`); return }
        const { data } = await supabase.from('products').select('*').order('model')
        if (data) setProducts(data as Product[])
      } else {
        setProducts(items => [...items, ...newProducts])
      }
      setNotice(`Se importaron ${imported.length} modelos desde ${file.name}.`)
    } catch {
      setNotice('No se pudo leer el Excel. Guarda el archivo como .xlsx e inténtalo de nuevo.')
    } finally {
      event.target.value = ''
    }
  }

  async function exportLowStock() {
    if (!lowProducts.length) { setNotice('No hay pantallas con stock bajo para descargar.'); return }
    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Surtido')
    worksheet.columns = [
      { header: 'Modelo', key: 'model', width: 30 },
      { header: 'Código', key: 'sku', width: 18 },
      { header: 'Categoría', key: 'category', width: 18 },
      { header: 'Existencia', key: 'stock', width: 13 },
      { header: 'Objetivo de surtido', key: 'target', width: 19 },
      { header: 'Cantidad sugerida', key: 'suggested', width: 20 },
    ]
    lowProducts.forEach(({ model, sku, category, stock, min_stock }) => worksheet.addRow({ model, sku, category, stock, target: min_stock, suggested: Math.max(1, min_stock - stock) }))
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `surtido-pantallas-${new Date().toISOString().slice(0, 10)}.xlsx`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('Lista de surtido descargada.')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#inicio" aria-label="Inicio">
          <span className="brand-mark"><Smartphone size={23} strokeWidth={2.2} /></span>
          <span><strong>smart<span>inven</span></strong><small>CONTROL DE INVENTARIO</small></span>
        </a>
        <div className="nav-label">MENÚ PRINCIPAL</div>
        <button className="nav-item selected" onClick={() => { setFilter('todos'); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><LayoutDashboard size={19} /> Resumen</button>
        <button className="nav-item" onClick={() => setFilter('bajo')}><Bell size={19} /> Alertas de stock {lowProducts.length > 0 && <span className="nav-badge">{lowProducts.length}</span>}</button>
        <div className="sidebar-bottom">
          <div className={`connection ${supabase && !cloudError ? 'connected' : ''}`}><span className="connection-dot" />{supabase && !cloudError ? 'Sincronización en la nube' : 'Guardado en este dispositivo'}</div>
          <div className="help-card"><span className="help-icon"><CircleHelp size={17} /></span><div><strong>¿Necesitas ayuda?</strong><span>Importa tu Excel para empezar.</span></div></div>
          <div className="user-row"><div className="avatar">SI</div><div><strong>{userEmail || 'Mi inventario'}</strong><span>{supabase ? 'Sincronizado' : 'Administrador'}</span></div>{supabase && <button className="signout-button" onClick={() => void supabase.auth.signOut()} title="Cerrar sesión">Salir</button>}<ChevronDown size={16} /></div>
        </div>
      </aside>

      <main className="main-content" id="inicio">
        <header className="topbar"><div className="breadcrumb">Inventario <span>/</span> <strong>Resumen</strong></div><div className="top-actions"><span className={`sync-label ${supabase && !cloudError ? 'sync-ok' : ''}`}><span />{supabase && !cloudError ? 'Sincronizado' : 'Modo local'}</span><button className="icon-button notification-button" onClick={() => setFilter('bajo')} aria-label="Ver alertas"><Bell size={19} />{lowProducts.length > 0 && <i />}</button><div className="top-avatar">SI</div></div></header>
        <div className="page-wrap">
          <section className="welcome-row"><div><div className="eyebrow">PANEL DE CONTROL</div><h1>Inventario de pantallas</h1><p>Administra modelos, existencias y prepara tu próximo surtido.</p></div><div className="welcome-actions"><input ref={importRef} type="file" accept=".xlsx" onChange={importExcel} hidden /><button className="button button-secondary" onClick={() => importRef.current?.click()}><Upload size={17} /> Importar Excel</button><button className="button button-primary" onClick={openCreate}><Plus size={18} /> Nuevo modelo</button></div></section>

          {notice && <div className="toast" role="status"><Check size={17} />{notice}<button onClick={() => setNotice('')} aria-label="Cerrar"><X size={16} /></button></div>}
          {supabase && cloudError && <div className="cloud-warning"><CloudOff size={17} />No hay conexión con la nube. Los cambios nuevos podrían quedar solo en este dispositivo.</div>}

          <section className="metrics-grid" aria-label="Resumen del inventario">
            <article className="metric-card"><div className="metric-top"><span className="metric-icon purple"><Package size={19} /></span><span className="metric-caption">TOTAL EN CATÁLOGO</span></div><strong className="metric-value">{loading ? '—' : products.length}</strong><span className="metric-foot">modelos registrados</span><span className="metric-decor decor-purple" /></article>
            <article className="metric-card"><div className="metric-top"><span className="metric-icon amber"><AlertTriangle size={19} /></span><span className="metric-caption">STOCK BAJO</span></div><strong className="metric-value">{loading ? '—' : lowProducts.length}</strong><span className="metric-foot">con 1 o menos disponibles</span><span className="metric-decor decor-amber" /></article>
            <article className="metric-card"><div className="metric-top"><span className="metric-icon rose"><Bell size={18} /></span><span className="metric-caption">AGOTADOS</span></div><strong className="metric-value">{loading ? '—' : outCount}</strong><span className="metric-foot">requieren surtido urgente</span><span className="metric-decor decor-rose" /></article>
            <article className="metric-card"><div className="metric-top"><span className="metric-icon mint"><FileSpreadsheet size={19} /></span><span className="metric-caption">UNIDADES EN STOCK</span></div><strong className="metric-value">{loading ? '—' : products.reduce((sum, item) => sum + item.stock, 0)}</strong><span className="metric-foot">unidades disponibles</span><span className="metric-decor decor-mint" /></article>
          </section>

          <section className="inventory-panel">
            <div className="panel-heading"><div><div className="panel-title"><h2>Modelos en inventario</h2><span className="count-chip">{visibleProducts.length}</span></div><p>Consulta y actualiza las existencias de tus pantallas.</p></div><button className="button button-export" onClick={exportLowStock}><ArrowDownToLine size={17} /> Descargar lista de surtido</button></div>
            <div className="table-toolbar"><div className="filter-tabs" role="tablist"><button className={filter === 'todos' ? 'active' : ''} onClick={() => setFilter('todos')}>Todos <span>{products.length}</span></button><button className={filter === 'bajo' ? 'active' : ''} onClick={() => setFilter('bajo')}>Stock bajo <span>{lowProducts.length}</span></button><button className={filter === 'agotado' ? 'active' : ''} onClick={() => setFilter('agotado')}>Agotados <span>{outCount}</span></button></div><label className="search-box"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar modelo o código..." /></label></div>
            <div className="table-scroll"><table><thead><tr><th>MODELO / PRODUCTO</th><th>CÓDIGO</th><th>CATEGORÍA</th><th>EXISTENCIA</th><th>ESTADO</th><th className="action-column">ACCIONES</th></tr></thead><tbody>
              {loading ? <tr><td className="empty-state" colSpan={6}><LoaderCircle className="spin" size={21} /> Cargando inventario...</td></tr> : visibleProducts.length === 0 ? <tr><td className="empty-state" colSpan={6}><span className="empty-icon"><Package size={22} /></span><strong>{products.length ? 'No hay resultados' : 'Tu inventario está listo para empezar'}</strong><span>{products.length ? 'Prueba otra búsqueda o filtro.' : 'Importa tu Excel o agrega tu primer modelo.'}</span>{!products.length && <button className="button button-secondary" onClick={() => importRef.current?.click()}><Upload size={16} /> Importar archivo Excel</button>}</td></tr> : visibleProducts.map(product => <tr key={product.id} className={isLow(product) ? 'low-row' : ''}><td><div className="product-cell"><span className="product-thumb"><Smartphone size={19} /></span><span><strong>{product.model}</strong><small>Actualizado {new Date(product.updated_at).toLocaleDateString('es-MX')}</small></span></div></td><td className="sku-cell">{product.sku || '—'}</td><td><span className="category-chip">{product.category || 'Pantallas'}</span></td><td><span className={`stock-number ${product.stock === 0 ? 'zero' : product.stock <= 1 ? 'one' : ''}`}>{product.stock}<small> u.</small></span></td><td>{product.stock === 0 ? <span className="status-pill status-out"><i />Agotado</span> : isLow(product) ? <span className="status-pill status-low"><i />Stock bajo</span> : <span className="status-pill status-ok"><i />Disponible</span>}</td><td><div className="row-actions"><button onClick={() => openEdit(product)} aria-label={`Editar ${product.model}`} title="Editar"><Edit3 size={16} /></button><button className="delete-action" onClick={() => void deleteProduct(product)} aria-label={`Eliminar ${product.model}`} title="Eliminar"><Trash2 size={16} /></button></div></td></tr>)}
            </tbody></table></div>
            <div className="table-footer"><span>Mostrando <strong>{visibleProducts.length}</strong> de <strong>{products.length}</strong> modelos</span><span className="footer-note"><span /> La alerta se activa con 1 unidad o menos</span></div>
          </section>
          <footer className="page-footer"><span>Smart Inven <span>·</span> Control sencillo, inventario al día.</span><span className="secure-note"><Check size={14} /> Tus datos, siempre a la mano</span></footer>
        </div>
      </main>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModalOpen(false) }}>
          <form className="product-modal" onSubmit={saveProduct}>
            <div className="modal-top">
              <span className="modal-icon"><Smartphone size={20} /></span>
              <button type="button" className="icon-button" onClick={() => setModalOpen(false)} aria-label="Cerrar"><X size={19} /></button>
            </div>
            <h2>{editing ? 'Editar modelo' : 'Agregar modelo'}</h2>
            <p>{editing ? 'Actualiza los datos y la existencia disponible.' : 'Registra una pantalla nueva en tu inventario.'}</p>
            <label>Modelo / nombre del producto<input autoFocus required value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder={'Ej. Pantalla Samsung 55"'} /></label>
            <div className="form-grid">
              <label>Código / SKU<input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="Opcional" /></label>
              <label>Categoría<input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Pantallas" /></label>
            </div>
            <div className="form-grid">
              <label>Existencia actual<input required type="number" min="0" step="1" value={form.stock} onChange={e => setForm({ ...form, stock: Math.max(0, numberValue(e.target.value)) })} /></label>
              <label>Objetivo de surtido<input required type="number" min="0" step="1" value={form.min_stock} onChange={e => setForm({ ...form, min_stock: Math.max(0, numberValue(e.target.value)) })} /><small>La alerta se activa cuando hay 1 unidad o se agota.</small></label>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button type="submit" className="button button-primary"><Check size={17} />{editing ? 'Guardar cambios' : 'Agregar modelo'}</button>
            </div>
          </form>
        </div>
      )}
      <div className="visually-hidden" aria-hidden="true"><Cloud size={1} /><CloudOff size={1} /><FileSpreadsheet size={1} /></div>
    </div>
  )
}

export default App
