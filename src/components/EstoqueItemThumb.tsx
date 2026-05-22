import { useEffect, useState } from 'react'
import { obterUrlImagemItem } from '../services/estoque.service'

const urlCache = new Map<string, string | null>()

async function resolverUrlImagem(ref: string): Promise<string | null> {
  const key = ref.trim()
  if (!key) return null
  if (urlCache.has(key)) return urlCache.get(key) ?? null
  if (/^https?:\/\//i.test(key)) {
    urlCache.set(key, key)
    return key
  }
  const url = await obterUrlImagemItem(key)
  urlCache.set(key, url)
  return url
}

type EstoqueItemThumbProps = {
  imagemUrl?: string | null
  alt: string
  /** card = grade do PDV; cart = linha do carrinho; picker = busca/combobox */
  variant?: 'card' | 'cart' | 'picker'
  className?: string
}

function IconPacote() {
  return (
    <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 12 21 7.5M12 12v9M12 12 3 7.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function EstoqueItemThumb({
  imagemUrl,
  alt,
  variant = 'card',
  className = '',
}: EstoqueItemThumbProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(Boolean(imagemUrl?.trim()))
  const [erro, setErro] = useState(false)

  useEffect(() => {
    const ref = imagemUrl?.trim()
    if (!ref) {
      setSrc(null)
      setCarregando(false)
      setErro(false)
      return
    }

    let ativo = true
    setCarregando(true)
    setErro(false)

    void resolverUrlImagem(ref)
      .then((url) => {
        if (!ativo) return
        setSrc(url)
        setErro(!url)
      })
      .catch(() => {
        if (!ativo) return
        setSrc(null)
        setErro(true)
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [imagemUrl])

  const classe = ['pdv-thumb', `pdv-thumb--${variant}`, className].filter(Boolean).join(' ')

  return (
    <span className={classe} aria-hidden={variant === 'card'}>
      {carregando && <span className="pdv-thumb__shimmer" />}
      {!carregando && src && !erro && (
        <img
          className="pdv-thumb__img"
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setErro(true)}
        />
      )}
      {!carregando && (!src || erro) && (
        <span className="pdv-thumb__placeholder">
          <IconPacote />
        </span>
      )}
    </span>
  )
}
