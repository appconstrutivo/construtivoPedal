import { useEffect, useState } from 'react'
import {
  applyManualManifest,
  ensureInstallPromptListener,
  getManualInstallKind,
  promptManualInstall,
  registerManualServiceWorker,
  type ManualInstallKind,
} from '../lib/manual-pwa'
import {
  carregarManualPublico,
  labelTipoRevisao,
  MANUAL_SECOES,
  type ManualManutencao,
  type ManualProprietarioPublico,
  type ManualRevisaoSlot,
  type ManualSecao,
  type TipoRevisaoManual,
} from '../services/manual-proprietario.service'

type ManualProprietarioPageProps = {
  token: string
}

type View = 'capa' | ManualSecao

function formatDate(iso: string | null) {
  if (!iso) return null
  const raw = iso.length <= 10 ? `${iso}T12:00:00` : iso
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconBike() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="5.5" cy="17.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18.5" cy="17.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 6l-3 8h6l3-5.5M5.5 17.5L9 14h3M15 14l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function tipoTone(tipo: TipoRevisaoManual | string): string {
  switch (tipo) {
    case 'verificacao_30':
      return 'teal'
    case 'periodica':
      return 'blue'
    case 'intermediaria':
      return 'amber'
    case 'geral':
      return 'violet'
    default:
      return 'slate'
  }
}

function SlotCard({ slot, destaque }: { slot: ManualRevisaoSlot; destaque?: boolean }) {
  const feita = slot.status === 'realizada'
  const atrasada = Boolean(slot.atrasada) && !feita
  const data = formatDate(slot.realizada_em)
  const prazo = formatDate(slot.prazo_em ?? null)

  return (
    <article
      className={[
        'man-pub__slot',
        feita ? 'man-pub__slot--feita' : 'man-pub__slot--pendente',
        atrasada ? 'man-pub__slot--atrasada' : '',
        destaque && !atrasada ? 'man-pub__slot--proxima' : '',
        `man-pub__slot--${tipoTone(slot.tipo)}`,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="man-pub__slot-seq" aria-hidden>
        {feita ? <IconCheck /> : atrasada ? '!' : <span>{slot.sequencia}</span>}
      </div>
      <div className="man-pub__slot-body">
        <h3 className="man-pub__slot-title">{slot.titulo}</h3>
        <p className="man-pub__slot-tipo">{labelTipoRevisao(slot.tipo)}</p>
        {feita ? (
          <div className="man-pub__carimbo">
            <span className="man-pub__carimbo-badge">Realizada</span>
            {data && <span className="man-pub__carimbo-data">{data}</span>}
            {slot.loja_nome && <span className="man-pub__carimbo-loja">{slot.loja_nome}</span>}
          </div>
        ) : atrasada ? (
          <div className="man-pub__atraso">
            <span className="man-pub__atraso-badge">Prazo vencido</span>
            <p className="man-pub__atraso-msg">
              A verificação de 30 dias não foi realizada no prazo
              {prazo ? ` (até ${prazo})` : ''}.
            </p>
          </div>
        ) : destaque ? (
          <p className="man-pub__slot-hint">Próxima revisão recomendada</p>
        ) : (
          <p className="man-pub__slot-hint">Aguardando</p>
        )}
      </div>
    </article>
  )
}

function ManutencaoCard({ m }: { m: ManualManutencao }) {
  const data = formatDate(m.data)
  return (
    <article className="man-pub__man">
      <header className="man-pub__man-head">
        <span className="man-pub__man-os">OS #{m.os_numero}</span>
        {data && <span className="man-pub__man-data">{data}</span>}
      </header>
      {m.loja_nome && <p className="man-pub__man-loja">{m.loja_nome}</p>}
      {m.problema && <p className="man-pub__man-problema">{m.problema}</p>}
      {m.itens?.length > 0 ? (
        <ul className="man-pub__man-itens">
          {m.itens.map((item, idx) => (
            <li key={`${item.descricao}-${idx}`}>
              <span className="man-pub__man-tag">{item.tipo === 'peca' ? 'Peça' : 'Serviço'}</span>
              {item.descricao}
              {Number(item.quantidade) > 1 ? ` × ${item.quantidade}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="man-pub__slot-hint">Sem itens registrados nesta OS.</p>
      )}
    </article>
  )
}

function CreditoRodape() {
  return (
    <p className="man-pub__credito">
      Construtivo Pedal · desenvolvido por Eng. Thiago Wendley
    </p>
  )
}

function SecaoCaracteristicas({ dados }: { dados: ManualProprietarioPublico }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Marca', value: dados.bike.marca },
    { label: 'Modelo', value: dados.bike.modelo },
  ]
  if (dados.bike.aro) rows.push({ label: 'Aro', value: dados.bike.aro })
  if (dados.bike.cor) rows.push({ label: 'Cor', value: dados.bike.cor })
  if (dados.bike.numero_serie) rows.push({ label: 'Nº de série / chassi', value: dados.bike.numero_serie })
  if (dados.bike.data_compra) {
    rows.push({
      label: 'Data da compra',
      value: formatDate(dados.bike.data_compra) ?? dados.bike.data_compra,
    })
  }
  if (dados.bike.quilometragem != null) {
    rows.push({ label: 'Quilometragem', value: `${dados.bike.quilometragem} km` })
  }
  if (dados.bike.observacoes?.trim()) {
    rows.push({ label: 'Observações', value: dados.bike.observacoes.trim() })
  }

  const empresa = dados.empresa_nome || dados.loja_nome || 'esta loja'
  const compradaFora = dados.bike.comprada_na_loja === false

  return (
    <div className="man-pub__sec-body">
      <p className="man-pub__lead">
        Identificação da sua bicicleta. Use estes dados em garantias, seguros e atendimento na loja.
      </p>
      {compradaFora && (
        <aside className="man-pub__origem" role="note">
          Esta bicicleta <strong>não foi adquirida na {empresa}</strong>. O histórico de revisões e
          manutenções registra o acompanhamento a partir do cadastro na oficina.
        </aside>
      )}
      <dl className="man-pub__specs-list">
        {rows.map((r) => (
          <div key={r.label} className="man-pub__specs-row">
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function SecaoCuidados() {
  return (
    <div className="man-pub__sec-body man-pub__prose">
      <p className="man-pub__lead">
        Pequenos cuidados aumentam a vida útil da bike e evitam visitas emergenciais à oficina.
      </p>
      <h3>Antes e depois de pedalar</h3>
      <ul>
        <li>Confira pressão dos pneus — muito baixa acelera o desgaste e dificulta o controle.</li>
        <li>Olhe freios, corrente e mudanças rápidas: se algo estiver “solto” ou ruidoso, pare e verifique.</li>
        <li>Após chuva ou lama, limpe a transmissão e seque a bike antes de guardar.</li>
      </ul>
      <h3>Limpeza e lubrificação</h3>
      <ul>
        <li>Use água em baixa pressão e detergente neutro. Evite jato forte nos cubos e na caixa de direção.</li>
        <li>Lubrifique a corrente com produto adequado ao clima (seco ou úmido) e remova o excesso.</li>
        <li>Não deixe a bike exposta ao sol forte por longos períodos — danifica pneus e acabamento.</li>
      </ul>
      <h3>Quando procurar a oficina</h3>
      <ul>
        <li>Ruídos novos, freio “esponjoso”, mudança que pula ou quadro/garfo com impacto.</li>
        <li>Siga o quadro de revisões deste manual — prevenção é mais barata que o reparo urgente.</li>
      </ul>
    </div>
  )
}

function SecaoUso() {
  return (
    <div className="man-pub__sec-body man-pub__prose">
      <p className="man-pub__lead">
        Use a bike no propósito para o qual ela foi projetada e ajuste o básico antes de cada saída.
      </p>
      <h3>Ajuste e postura</h3>
      <ul>
        <li>Altura do selim: com o pedal no ponto baixo, o joelho fica levemente flexionado.</li>
        <li>Guidão e manetes devem permitir frear e mudar de marcha sem forçar os pulsos.</li>
        <li>Use capacete e, à noite, luz dianteira e traseira.</li>
      </ul>
      <h3>No pedalar</h3>
      <ul>
        <li>Antecipe as mudanças de marcha — evite cruzar a corrente em extremos (grande-grande / pequena-pequena).</li>
        <li>Freie progressivamente, priorizando o freio traseiro em piso escorregadio.</li>
        <li>Respeite o limite de carga do fabricante (ciclista + bagagem).</li>
      </ul>
      <h3>Transporte e guarda</h3>
      <ul>
        <li>Ao transportar no carro, fixe bem e proteja a transmissão.</li>
        <li>Guarde em local seco; se possível, suspensa ou com o peso nas rodas, não no câmbio.</li>
      </ul>
    </div>
  )
}

function SecaoRevisoes({ dados }: { dados: ManualProprietarioPublico }) {
  const feitas = dados.revisoes.filter((r) => r.status === 'realizada').length
  const proxSeq = dados.proxima?.sequencia ?? null
  const atrasada30 = Boolean(dados.verificacao_30_atrasada)
  const prazo30 = formatDate(dados.prazo_verificacao_30 ?? null)

  return (
    <div className="man-pub__sec-body">
      <p className="man-pub__lead">
        Quadro de revisões programadas. Quando a oficina concluir uma revisão na Ordem de Servilo, o carimbo
        aparece aqui com a data e o nome da loja.
      </p>

      {atrasada30 && (
        <aside className="man-pub__alerta-atraso" role="alert">
          <strong>Verificação de 30 dias em atraso</strong>
          <p>
            Contado a partir da data de compra, o prazo
            {prazo30 ? ` (até ${prazo30})` : ''} já passou e esta verificação ainda não foi
            registrada. Agende na oficina o quanto antes.
          </p>
        </aside>
      )}

      {dados.proxima && !atrasada30 && (
        <div className="man-pub__next" role="status">
          <span className="man-pub__next-label">Próxima</span>
          <strong>{dados.proxima.titulo}</strong>
        </div>
      )}

      {dados.proxima && atrasada30 && (
        <div className="man-pub__next man-pub__next--atraso" role="status">
          <span className="man-pub__next-label">Em atraso</span>
          <strong>{dados.proxima.titulo}</strong>
        </div>
      )}

      <p className="man-pub__progress">
        {feitas} de {dados.revisoes.length} revisões no quadro
      </p>

      <div className="man-pub__board" aria-label="Quadro de revisões">
        {dados.revisoes.map((slot) => (
          <SlotCard
            key={slot.sequencia}
            slot={slot}
            destaque={proxSeq != null && slot.sequencia === proxSeq}
          />
        ))}
      </div>
    </div>
  )
}

function SecaoManutencoes({ dados }: { dados: ManualProprietarioPublico }) {
  const lista = dados.manutencoes ?? []
  return (
    <div className="man-pub__sec-body">
      <p className="man-pub__lead">
        Histórico de tudo que a oficina registrou nesta bike — peças, serviços e diagnósticos —
        separado do quadro de revisões programadas.
      </p>
      {lista.length === 0 ? (
        <p className="man-pub__empty">Ainda não há manutenções entregues para esta bike.</p>
      ) : (
        <div className="man-pub__man-list">
          {lista.map((m) => (
            <ManutencaoCard key={`${m.os_numero}-${m.data}`} m={m} />
          ))}
        </div>
      )}
    </div>
  )
}

function InstallManualCard({
  kind,
  onPrompt,
}: {
  kind: ManualInstallKind
  onPrompt: () => void
}) {
  if (kind === 'installed' || kind === 'unsupported') return null

  if (kind === 'ios') {
    return (
      <aside className="man-capa__install" aria-label="Adicionar à tela inicial">
        <p className="man-capa__install-title">Instalar no iPhone</p>
        <ol className="man-capa__install-steps">
          <li>
            Toque em <strong>Compartilhar</strong> (ícone da caixa com seta) na barra do Safari
          </li>
          <li>
            Escolha <strong>Adicionar à Tela de Início</strong>
          </li>
          <li>
            Confirme em <strong>Adicionar</strong>
          </li>
        </ol>
        <p className="man-capa__install-hint">O atalho abre direto o manual desta bike.</p>
      </aside>
    )
  }

  if (kind === 'prompt') {
    return (
      <aside className="man-capa__install man-capa__install--action">
        <p className="man-capa__install-title">Acesso rápido no celular</p>
        <p className="man-capa__install-hint">
          Adicione um atalho na tela inicial — como um app, sem baixar da loja.
        </p>
        <button type="button" className="man-capa__install-btn" onClick={onPrompt}>
          Instalar manual no celular
        </button>
      </aside>
    )
  }

  return (
    <aside className="man-capa__install" aria-label="Adicionar à tela inicial">
      <p className="man-capa__install-title">Instalar no celular</p>
      <ol className="man-capa__install-steps">
        <li>
          Abra o menu do navegador <strong>⋮</strong>
        </li>
        <li>
          Toque em <strong>Adicionar à tela inicial</strong> ou <strong>Instalar app</strong>
        </li>
      </ol>
      <p className="man-capa__install-hint">O ícone fica na tela inicial e abre este manual.</p>
    </aside>
  )
}

export function ManualProprietarioPage({ token }: ManualProprietarioPageProps) {
  const [dados, setDados] = useState<ManualProprietarioPublico | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [view, setView] = useState<View>('capa')
  const [installKind, setInstallKind] = useState<ManualInstallKind>('manual')
  const [installMsg, setInstallMsg] = useState<string | null>(null)

  useEffect(() => {
    ensureInstallPromptListener()
    void registerManualServiceWorker()
    const refresh = () => setInstallKind(getManualInstallKind())
    refresh()
    window.addEventListener('cp-manual-install-available', refresh)
    window.addEventListener('cp-manual-installed', refresh)
    return () => {
      window.removeEventListener('cp-manual-install-available', refresh)
      window.removeEventListener('cp-manual-installed', refresh)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setErro(null)
    void carregarManualPublico(token)
      .then((res) => {
        if (!res) {
          setErro('Manual não encontrado ou link inválido.')
          setDados(null)
          return
        }
        setDados(res)
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!dados) return
    const bikeLabel = `${dados.bike.marca} ${dados.bike.modelo}`.trim()
    return applyManualManifest({
      token,
      bikeLabel,
      lojaNome: dados.loja_nome || dados.empresa_nome,
    })
  }, [dados, token])

  async function handleInstalar() {
    setInstallMsg(null)
    const outcome = await promptManualInstall()
    if (outcome === 'accepted') {
      setInstallMsg('Pronto! O atalho foi adicionado.')
      setInstallKind('installed')
    } else if (outcome === 'dismissed') {
      setInstallMsg('Você pode instalar depois pelo menu do navegador.')
    } else {
      setInstallKind(getManualInstallKind())
    }
  }

  const specsCapa = [
    dados?.bike.aro ? `Aro ${dados.bike.aro}` : null,
    dados?.bike.cor ?? null,
  ].filter(Boolean)

  const secaoAtual = MANUAL_SECOES.find((s) => s.id === view)
  const tituloSecao =
    view === 'sumario' ? 'Sumário' : (secaoAtual?.label ?? 'Manual')

  return (
    <div className={`man-pub ${view === 'capa' ? 'man-pub--capa' : 'man-pub--interno'}`}>
      {loading && (
        <div className="man-pub__shell">
          <p className="man-pub__hint">Carregando manual…</p>
        </div>
      )}
      {erro && (
        <div className="man-pub__shell">
          <p className="man-pub__erro">{erro}</p>
          <CreditoRodape />
        </div>
      )}

      {!loading && dados && view === 'capa' && (
        <div className="man-capa">
          <div className="man-capa__glow" aria-hidden />
          <header className="man-capa__brand">
            {dados.empresa_logo_url ? (
              <img
                className="man-capa__logo"
                src={dados.empresa_logo_url}
                alt={dados.empresa_nome ?? 'Loja'}
              />
            ) : (
              <span className="man-capa__icon" aria-hidden>
                <IconBike />
              </span>
            )}
            <p className="man-capa__loja">{dados.loja_nome || dados.empresa_nome}</p>
          </header>

          <div className="man-capa__hero">
            <p className="man-capa__eyebrow">Manual do Proprietário</p>
            <h1 className="man-capa__title">
              {dados.bike.marca} {dados.bike.modelo}
            </h1>
            {dados.cliente_primeiro_nome && (
              <p className="man-capa__hello">Olá, {dados.cliente_primeiro_nome}</p>
            )}
            {specsCapa.length > 0 && <p className="man-capa__specs">{specsCapa.join(' · ')}</p>}
          </div>

          <div className="man-capa__actions">
            <button
              type="button"
              className="man-capa__cta"
              onClick={() => setView('sumario')}
            >
              Abrir manual
            </button>

            <InstallManualCard kind={installKind} onPrompt={() => void handleInstalar()} />
            {installMsg && <p className="man-capa__install-ok">{installMsg}</p>}
          </div>

          <CreditoRodape />
        </div>
      )}

      {!loading && dados && view !== 'capa' && (
        <div className="man-pub__shell">
          <header className="man-pub__topbar">
            <button
              type="button"
              className="man-pub__back"
              onClick={() => setView(view === 'sumario' ? 'capa' : 'sumario')}
              aria-label={view === 'sumario' ? 'Voltar à capa' : 'Voltar ao sumário'}
            >
              <IconBack />
              <span>{view === 'sumario' ? 'Capa' : 'Sumário'}</span>
            </button>
            <div className="man-pub__topbar-meta">
              <p className="man-pub__topbar-bike">
                {dados.bike.marca} {dados.bike.modelo}
              </p>
              <p className="man-pub__topbar-sec">{tituloSecao}</p>
            </div>
          </header>

          {view === 'sumario' && (
            <section className="man-pub__sumario" aria-label="Sumário do manual">
              <p className="man-pub__lead">
                Escolha uma seção. O quadro de revisões e o histórico de manutenções são atualizados
                pela oficina.
              </p>
              <nav className="man-pub__nav">
                {MANUAL_SECOES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="man-pub__nav-item"
                    onClick={() => setView(s.id)}
                  >
                    <span className="man-pub__nav-label">{s.label}</span>
                    <span className="man-pub__nav-blurb">{s.blurb}</span>
                  </button>
                ))}
              </nav>
            </section>
          )}

          {view === 'caracteristicas' && <SecaoCaracteristicas dados={dados} />}
          {view === 'cuidados' && <SecaoCuidados />}
          {view === 'uso' && <SecaoUso />}
          {view === 'revisoes' && <SecaoRevisoes dados={dados} />}
          {view === 'manutencoes' && <SecaoManutencoes dados={dados} />}

          <footer className="man-pub__foot">
            <CreditoRodape />
          </footer>
        </div>
      )}
    </div>
  )
}
