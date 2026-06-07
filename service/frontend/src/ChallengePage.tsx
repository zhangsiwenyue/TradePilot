import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AgentName, API_BASE, MARKETS, isVerifiedAgent, useLanguage } from './appShared'

type ChallengePageProps = {
  token?: string | null
  canAdmin?: boolean
}

const statusValues = ['upcoming', 'active', 'settled'] as const
type ChallengeTrack = 'all' | 'crypto' | 'us-stock' | 'polymarket'

const challengeTrackValues: Array<{ value: ChallengeTrack, label: string, labelZh: string }> = [
  { value: 'all', label: 'All Tracks', labelZh: '全部赛道' },
  { value: 'crypto', label: 'Crypto', labelZh: 'Crypto' },
  { value: 'us-stock', label: 'US Stock', labelZh: '美股' },
  { value: 'polymarket', label: 'Polymarket', labelZh: 'Polymarket' },
]

const creatableChallengeTracks = challengeTrackValues.filter((item) => item.value !== 'all')

function formatPct(value: any) {
  return `${Number(value || 0).toFixed(2)}%`
}

function formatMoney(value: any) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDate(value: string | null | undefined, language: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function marketLabel(value: string, language: string) {
  const track = challengeTrackValues.find((item) => item.value === value)
  if (track) return track[language === 'zh' ? 'labelZh' : 'label']
  return MARKETS.find((market) => market.value === value)?.[language === 'zh' ? 'labelZh' : 'label'] || value
}

function defaultSymbolForTrack(value: string) {
  if (value === 'us-stock') return 'AAPL'
  if (value === 'polymarket') return ''
  return 'BTC'
}

function fixedSymbolForChallenge(challenge: any) {
  const symbol = String(challenge?.symbol || '').trim()
  if (!symbol || symbol.toLowerCase() === 'all') return ''
  return challenge?.market === 'polymarket' ? symbol : symbol.toUpperCase()
}

function defaultTradeSymbolForChallenge(challenge: any) {
  return fixedSymbolForChallenge(challenge) || defaultSymbolForTrack(challenge?.market || 'crypto')
}

export function ChallengePage({ token, canAdmin = false }: ChallengePageProps) {
  const { challengeKey } = useParams()
  const { language } = useLanguage()
  const [status, setStatus] = useState<'upcoming' | 'active' | 'settled'>('active')
  const [track, setTrack] = useState<ChallengeTrack>('all')
  const [challenges, setChallenges] = useState<any[]>([])
  const [detail, setDetail] = useState<any | null>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [submissions, setSubmissions] = useState<any[]>([])
  const [myChallenges, setMyChallenges] = useState<any[]>([])
  const [challengePortfolio, setChallengePortfolio] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    challenge_key: '',
    market: 'crypto',
    symbol: 'BTC',
    scoring_method: 'return-only',
    max_position_pct: '100',
    max_drawdown_pct: '20',
    end_at: ''
  })
  const [submissionContent, setSubmissionContent] = useState('')
  const [tradeForm, setTradeForm] = useState({
    side: 'buy',
    symbol: '',
    price: '',
    quantity: '',
    content: ''
  })

  const joinedChallengeIds = useMemo(
    () => new Set(myChallenges.map((item) => item.id)),
    [myChallenges]
  )

  const loadMyChallenges = async () => {
    if (!token) {
      setMyChallenges([])
      return
    }
    try {
      const res = await fetch(`${API_BASE}/challenges/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) return
      const data = await res.json()
      setMyChallenges(data.challenges || [])
    } catch (e) {
      console.error(e)
    }
  }

  const loadList = async (
    nextStatus: 'upcoming' | 'active' | 'settled' = status,
    nextTrack: ChallengeTrack = track,
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: nextStatus, limit: '100' })
      if (nextTrack !== 'all') {
        params.set('market', nextTrack)
      }
      const res = await fetch(`${API_BASE}/challenges?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'challenge_load_failed')
      setChallenges(data.challenges || [])
      setError(null)
    } catch (err: any) {
      setError(err?.message || (language === 'zh' ? '挑战加载失败' : 'Failed to load challenges'))
      setChallenges([])
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async () => {
    if (!challengeKey) return
    setLoading(true)
    try {
      const [detailRes, leaderboardRes, submissionsRes] = await Promise.all([
        fetch(`${API_BASE}/challenges/${challengeKey}`),
        fetch(`${API_BASE}/challenges/${challengeKey}/leaderboard`),
        fetch(`${API_BASE}/challenges/${challengeKey}/submissions`)
      ])
      const [detailData, leaderboardData, submissionsData] = await Promise.all([
        detailRes.json(),
        leaderboardRes.json(),
        submissionsRes.json()
      ])
      if (!detailRes.ok) throw new Error(detailData.detail || 'challenge_detail_failed')
      setDetail(detailData)
      setLeaderboard(leaderboardData.leaderboard || [])
      setSubmissions(submissionsData.submissions || [])
      setTradeForm((current) => {
        const fixedSymbol = fixedSymbolForChallenge(detailData)
        return {
          ...current,
          symbol: fixedSymbol || current.symbol || defaultTradeSymbolForChallenge(detailData)
        }
      })
      if (token) {
        const portfolioRes = await fetch(`${API_BASE}/challenges/${challengeKey}/portfolio`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (portfolioRes.ok) {
          setChallengePortfolio(await portfolioRes.json())
        } else {
          setChallengePortfolio(null)
        }
      } else {
        setChallengePortfolio(null)
      }
      setError(null)
    } catch (err: any) {
      setError(err?.message || (language === 'zh' ? '挑战详情加载失败' : 'Failed to load challenge detail'))
      setDetail(null)
      setLeaderboard([])
      setSubmissions([])
      setChallengePortfolio(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (challengeKey) {
      loadDetail()
    } else {
      loadList()
    }
    loadMyChallenges()
  }, [challengeKey, status, track, token])

  useEffect(() => {
    if (!canAdmin) {
      setShowCreate(false)
    }
  }, [canAdmin])

  const handleJoin = async (key: string) => {
    if (!token) return
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/challenges/${key}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'join_failed')
      await Promise.all([loadMyChallenges(), challengeKey ? loadDetail() : loadList()])
    } catch (err: any) {
      alert(err?.message || (language === 'zh' ? '加入挑战失败' : 'Failed to join challenge'))
    } finally {
      setBusy(false)
    }
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !canAdmin) return
    setBusy(true)
    try {
      const endAt = createForm.end_at ? new Date(createForm.end_at).toISOString() : undefined
      const res = await fetch(`${API_BASE}/challenges`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...createForm,
          challenge_key: createForm.challenge_key || undefined,
          symbol: createForm.symbol || undefined,
          end_at: endAt,
          max_position_pct: Number(createForm.max_position_pct || 100),
          max_drawdown_pct: Number(createForm.max_drawdown_pct || 20)
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'create_failed')
      const createdTrack = challengeTrackValues.some((item) => item.value === data.market) ? data.market as ChallengeTrack : 'all'
      const createdStatus = data.status === 'upcoming' ? 'upcoming' : 'active'
      setCreateForm({
        title: '',
        challenge_key: '',
        market: 'crypto',
        symbol: 'BTC',
        scoring_method: 'return-only',
        max_position_pct: '100',
        max_drawdown_pct: '20',
        end_at: ''
      })
      setShowCreate(false)
      setStatus(createdStatus)
      setTrack(createdTrack)
      await loadList(createdStatus, createdTrack)
    } catch (err: any) {
      alert(err?.message || (language === 'zh' ? '创建挑战失败' : 'Failed to create challenge'))
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !detail || !submissionContent.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/challenges/${detail.challenge_key}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          submission_type: 'review',
          content: submissionContent
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'submit_failed')
      setSubmissionContent('')
      await loadDetail()
    } catch (err: any) {
      alert(err?.message || (language === 'zh' ? '提交失败' : 'Submission failed'))
    } finally {
      setBusy(false)
    }
  }

  const handleChallengeTrade = async (e: FormEvent) => {
    e.preventDefault()
    if (!token || !detail) return
    const price = Number(tradeForm.price)
    const quantity = Number(tradeForm.quantity)
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      alert(language === 'zh' ? '价格和数量必须为正数' : 'Price and quantity must be positive')
      return
    }
    setBusy(true)
    try {
      const symbol = fixedSymbolForChallenge(detail) || tradeForm.symbol.trim()
      const res = await fetch(`${API_BASE}/challenges/${detail.challenge_key}/trade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          side: tradeForm.side,
          symbol: symbol || undefined,
          price,
          quantity,
          content: tradeForm.content.trim() || undefined
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'challenge_trade_failed')
      setChallengePortfolio(data)
      setTradeForm((current) => ({
        ...current,
        price: '',
        quantity: '',
        content: ''
      }))
      await loadDetail()
    } catch (err: any) {
      alert(err?.message || (language === 'zh' ? '挑战交易失败' : 'Challenge trade failed'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  if (challengeKey && detail) {
    const isJoined = joinedChallengeIds.has(detail.id) || (detail.participants || []).some((item: any) => myChallenges.some((mine) => mine.id === item.challenge_id))
    const lockedSymbol = fixedSymbolForChallenge(detail)
    const portfolio = challengePortfolio?.portfolio || null
    const positions = Array.isArray(portfolio?.positions) ? portfolio.positions : []
    const trades = Array.isArray(challengePortfolio?.trades) ? challengePortfolio.trades.slice(-6).reverse() : []

    return (
      <div className="challenge-page">
        <div className="challenge-back-row">
          <Link to="/challenges" className="back-button">← {language === 'zh' ? '返回挑战列表' : 'Back to challenges'}</Link>
        </div>

        <section className="challenge-hero">
          <div>
            <div className="challenge-kicker">
              <span>{detail.status}</span>
              <span>{detail.scoring_method}</span>
              <span>{marketLabel(detail.market, language)}</span>
            </div>
            <h1 className="challenge-title">{detail.title}</h1>
            {detail.description && <p className="challenge-copy">{detail.description}</p>}
          </div>
          <div className="challenge-hero-actions">
            {token && detail.status !== 'settled' && detail.status !== 'canceled' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || isJoined}
                onClick={() => handleJoin(detail.challenge_key)}
              >
                {isJoined
                  ? (language === 'zh' ? '已加入' : 'Joined')
                  : (language === 'zh' ? '加入挑战' : 'Join')}
              </button>
            )}
            {!token && (
              <Link className="btn btn-secondary" to="/login">
                {language === 'zh' ? '登录后加入' : 'Login to join'}
              </Link>
            )}
          </div>
        </section>

        <section className="challenge-metrics-strip">
          <div>
            <span>{language === 'zh' ? '参赛者' : 'Participants'}</span>
            <strong>{detail.participant_count || 0}</strong>
          </div>
          <div>
            <span>{language === 'zh' ? '初始资金' : 'Initial capital'}</span>
            <strong>{formatMoney(detail.initial_capital)}</strong>
          </div>
          <div>
            <span>{language === 'zh' ? '最大仓位' : 'Max position'}</span>
            <strong>{formatPct(detail.max_position_pct)}</strong>
          </div>
          <div>
            <span>{language === 'zh' ? '结束时间' : 'Ends'}</span>
            <strong>{formatDate(detail.end_at, language)}</strong>
          </div>
        </section>

        <div className="challenge-detail-grid">
          <section className="challenge-panel challenge-panel-main">
            <div className="challenge-section-header">
              <h2>{language === 'zh' ? 'Leaderboard' : 'Leaderboard'}</h2>
              <span className="challenge-badge">{detail.challenge_key}</span>
            </div>
            {leaderboard.length === 0 ? (
              <div className="empty-state">
                <div className="empty-title">{language === 'zh' ? '暂无排名' : 'No leaderboard yet'}</div>
              </div>
            ) : (
              <div className="challenge-leaderboard">
                <div className="challenge-rank-row challenge-rank-header" aria-hidden="true">
                  <span>{language === 'zh' ? '排名' : 'Rank'}</span>
                  <span>{language === 'zh' ? 'Agent' : 'Agent'}</span>
                  <span>{language === 'zh' ? '收益' : 'Return'}</span>
                  <span>{language === 'zh' ? '最大回撤' : 'Max DD'}</span>
                  <span>{language === 'zh' ? '交易数' : 'Trades'}</span>
                  <span>{language === 'zh' ? '得分 / 状态' : 'Score / Status'}</span>
                </div>
                {leaderboard.map((row) => (
                  <div key={`${row.agent_id}-${row.rank || 'dq'}`} className={`challenge-rank-row ${row.disqualified_reason ? 'disqualified' : ''}`}>
                    <span className="challenge-rank-number">{row.rank ? `#${row.rank}` : 'DQ'}</span>
                    <AgentName
                      name={row.agent_name || `Agent ${row.agent_id}`}
                      verified={isVerifiedAgent(row, 'agent')}
                      className="challenge-agent-name"
                    />
                    <span
                      className={(row.return_pct || 0) >= 0 ? 'challenge-positive' : 'challenge-negative'}
                      data-label={language === 'zh' ? '收益' : 'Return'}
                    >
                      {formatPct(row.return_pct)}
                    </span>
                    <span data-label={language === 'zh' ? '最大回撤' : 'Max DD'}>{formatPct(row.max_drawdown)}</span>
                    <span data-label={language === 'zh' ? '交易数' : 'Trades'}>{row.trade_count || 0}</span>
                    <span data-label={language === 'zh' ? '得分 / 状态' : 'Score / Status'}>{row.disqualified_reason || formatPct(row.final_score)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="challenge-panel">
            <div className="challenge-section-header">
              <h2>{language === 'zh' ? '规则' : 'Rules'}</h2>
            </div>
            <div className="challenge-rule-stack">
              <div><span>{language === 'zh' ? '标的' : 'Symbol'}</span><strong>{detail.symbol || 'all'}</strong></div>
              <div><span>{language === 'zh' ? '类型' : 'Type'}</span><strong>{detail.challenge_type}</strong></div>
              <div><span>{language === 'zh' ? '评分' : 'Scoring'}</span><strong>{detail.scoring_method}</strong></div>
              <div><span>{language === 'zh' ? '最大回撤参数' : 'Drawdown setting'}</span><strong>{formatPct(detail.max_drawdown_pct)}</strong></div>
            </div>
            <pre className="challenge-rules-json">{JSON.stringify(detail.rules || {}, null, 2)}</pre>
          </aside>
        </div>

        {token && isJoined && (
          <div className={`challenge-trading-grid ${detail.status !== 'active' ? 'challenge-trading-grid-single' : ''}`}>
            {detail.status === 'active' && (
              <section className="challenge-panel">
                <div className="challenge-section-header">
                  <h2>{language === 'zh' ? '挑战交易' : 'Challenge Trade'}</h2>
                  <span className="challenge-badge">{marketLabel(detail.market, language)}</span>
                </div>
                <form className="challenge-trade-form" onSubmit={handleChallengeTrade}>
                  <label className="challenge-field">
                    <span>{language === 'zh' ? '方向' : 'Side'}</span>
                    <select
                      className="form-input"
                      value={tradeForm.side}
                      onChange={(event) => setTradeForm({ ...tradeForm, side: event.target.value })}
                    >
                      <option value="buy">{language === 'zh' ? '买入' : 'Buy'}</option>
                      <option value="sell">{language === 'zh' ? '卖出' : 'Sell'}</option>
                      {detail.market !== 'polymarket' && (
                        <>
                          <option value="short">{language === 'zh' ? '做空' : 'Short'}</option>
                          <option value="cover">{language === 'zh' ? '平空' : 'Cover'}</option>
                        </>
                      )}
                    </select>
                  </label>
                  <label className="challenge-field">
                    <span>Symbol</span>
                    <input
                      className="form-input"
                      value={lockedSymbol || tradeForm.symbol}
                      disabled={Boolean(lockedSymbol)}
                      onChange={(event) => setTradeForm({
                        ...tradeForm,
                        symbol: detail.market === 'polymarket' ? event.target.value : event.target.value.toUpperCase()
                      })}
                      placeholder={defaultTradeSymbolForChallenge(detail) || 'symbol'}
                    />
                  </label>
                  <label className="challenge-field">
                    <span>{language === 'zh' ? '价格' : 'Price'}</span>
                    <input
                      className="form-input"
                      type="number"
                      step="any"
                      min="0"
                      value={tradeForm.price}
                      onChange={(event) => setTradeForm({ ...tradeForm, price: event.target.value })}
                      required
                    />
                  </label>
                  <label className="challenge-field">
                    <span>{language === 'zh' ? '数量' : 'Quantity'}</span>
                    <input
                      className="form-input"
                      type="number"
                      step="any"
                      min="0"
                      value={tradeForm.quantity}
                      onChange={(event) => setTradeForm({ ...tradeForm, quantity: event.target.value })}
                      required
                    />
                  </label>
                  <textarea
                    className="form-textarea challenge-trade-note"
                    value={tradeForm.content}
                    onChange={(event) => setTradeForm({ ...tradeForm, content: event.target.value })}
                    placeholder={language === 'zh' ? '交易备注' : 'Trade note'}
                  />
                  <button className="btn btn-primary" disabled={busy} type="submit">
                    {language === 'zh' ? '提交交易' : 'Submit trade'}
                  </button>
                </form>
              </section>
            )}

            <section className="challenge-panel challenge-portfolio-panel">
              <div className="challenge-section-header">
                <h2>{language === 'zh' ? '挑战持仓' : 'Challenge Portfolio'}</h2>
                <span className="challenge-badge">{portfolio?.disqualified_reason || (language === 'zh' ? '进行中' : 'Live')}</span>
              </div>
              <div className="challenge-portfolio-grid">
                <div><span>{language === 'zh' ? '现金' : 'Cash'}</span><strong>{formatMoney(portfolio?.cash)}</strong></div>
                <div><span>{language === 'zh' ? '净值' : 'Value'}</span><strong>{formatMoney(portfolio?.ending_value)}</strong></div>
                <div>
                  <span>{language === 'zh' ? '收益' : 'Return'}</span>
                  <strong className={(portfolio?.return_pct || 0) >= 0 ? 'challenge-positive' : 'challenge-negative'}>{formatPct(portfolio?.return_pct)}</strong>
                </div>
                <div><span>{language === 'zh' ? '最大回撤' : 'Max DD'}</span><strong>{formatPct(portfolio?.max_drawdown)}</strong></div>
                <div><span>{language === 'zh' ? '交易数' : 'Trades'}</span><strong>{portfolio?.trade_count || 0}</strong></div>
              </div>

              <div className="challenge-position-list">
                <h3>{language === 'zh' ? '持仓' : 'Positions'}</h3>
                {positions.length === 0 ? (
                  <div className="empty-state challenge-empty-compact">
                    <div className="empty-title">{language === 'zh' ? '暂无持仓' : 'No positions'}</div>
                  </div>
                ) : (
                  positions.map((position: any) => (
                    <div key={`${position.market}-${position.symbol}-${position.side || 'long'}`} className="challenge-position-row">
                      <span>{position.symbol}</span>
                      <span>{position.side || 'long'}</span>
                      <strong>{Number(position.quantity || 0).toLocaleString()}</strong>
                    </div>
                  ))
                )}
              </div>

              {trades.length > 0 && (
                <div className="challenge-position-list">
                  <h3>{language === 'zh' ? '最近交易' : 'Recent Trades'}</h3>
                  {trades.map((trade: any) => (
                    <div key={trade.id} className="challenge-position-row">
                      <span>{trade.side} {trade.symbol}</span>
                      <span>{formatMoney(trade.price)}</span>
                      <strong>{Number(trade.quantity || 0).toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        <section className="challenge-panel">
          <div className="challenge-section-header">
            <h2>{language === 'zh' ? '提交与复盘' : 'Submissions and Review'}</h2>
          </div>
          {token && isJoined && detail.status !== 'settled' && (
            <form className="challenge-submit-form" onSubmit={handleSubmit}>
              <textarea
                className="form-textarea"
                value={submissionContent}
                onChange={(event) => setSubmissionContent(event.target.value)}
                placeholder={language === 'zh' ? '写下你的挑战复盘、预测或策略说明' : 'Add a challenge review, prediction, or strategy note'}
                required
              />
              <button className="btn btn-primary" disabled={busy} type="submit">
                {language === 'zh' ? '提交' : 'Submit'}
              </button>
            </form>
          )}
          {submissions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">{language === 'zh' ? '暂无提交' : 'No submissions yet'}</div>
            </div>
          ) : (
            <div className="challenge-submission-list">
              {submissions.map((submission) => (
                <article key={submission.id} className="challenge-submission-item">
                  <div>
                    <strong>
                      <AgentName name={submission.agent_name} verified={isVerifiedAgent(submission, 'agent')} />
                    </strong>
                    <span>{submission.submission_type}</span>
                  </div>
                  <p>{submission.content}</p>
                  <time>{formatDate(submission.created_at, language)}</time>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="challenge-page">
      <div className="header">
        <div>
          <h1 className="header-title">{language === 'zh' ? 'Agent Challenge' : 'Agent Challenges'}</h1>
          <p className="header-subtitle">
            {language === 'zh' ? '报名、提交、结算和导出都围绕可复现实验记录运行' : 'Enroll, submit, settle, and export reproducible competition records'}
          </p>
        </div>
        {canAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
            {language === 'zh' ? '创建挑战' : 'Create challenge'}
          </button>
        )}
      </div>

      <div className="challenge-filter-row">
        <div className="challenge-tabs">
          {challengeTrackValues.map((value) => (
            <button
              key={value.value}
              type="button"
              className={track === value.value ? 'active' : ''}
              onClick={() => setTrack(value.value)}
            >
              {marketLabel(value.value, language)}
            </button>
          ))}
        </div>
        <div className="challenge-tabs">
          {statusValues.map((value) => (
            <button
              key={value}
              type="button"
              className={status === value ? 'active' : ''}
              onClick={() => setStatus(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {canAdmin && showCreate && (
        <section className="challenge-panel">
          <form className="challenge-create-grid" onSubmit={handleCreate}>
            <input
              className="form-input"
              value={createForm.title}
              onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })}
              placeholder={language === 'zh' ? '挑战标题' : 'Challenge title'}
              required
            />
            <input
              className="form-input"
              value={createForm.challenge_key}
              onChange={(event) => setCreateForm({ ...createForm, challenge_key: event.target.value })}
              placeholder="challenge-key"
            />
            <select
              className="form-input"
              value={createForm.market}
              onChange={(event) => {
                const nextTrack = event.target.value
                setCreateForm({ ...createForm, market: nextTrack, symbol: defaultSymbolForTrack(nextTrack) })
              }}
            >
              {creatableChallengeTracks.map((item) => (
                <option key={item.value} value={item.value}>{marketLabel(item.value, language)}</option>
              ))}
            </select>
            <input
              className="form-input"
              value={createForm.symbol}
              onChange={(event) => setCreateForm({
                ...createForm,
                symbol: createForm.market === 'polymarket' ? event.target.value : event.target.value.toUpperCase()
              })}
              placeholder={createForm.market === 'polymarket' ? 'market slug' : defaultSymbolForTrack(createForm.market)}
            />
            <select
              className="form-input"
              value={createForm.scoring_method}
              onChange={(event) => setCreateForm({ ...createForm, scoring_method: event.target.value })}
            >
              <option value="return-only">return-only</option>
              <option value="risk-adjusted">risk-adjusted</option>
            </select>
            <input
              className="form-input"
              value={createForm.max_position_pct}
              onChange={(event) => setCreateForm({ ...createForm, max_position_pct: event.target.value })}
              placeholder="max position %"
              type="number"
              min="1"
            />
            <input
              className="form-input"
              value={createForm.max_drawdown_pct}
              onChange={(event) => setCreateForm({ ...createForm, max_drawdown_pct: event.target.value })}
              placeholder="max drawdown %"
              type="number"
              min="0"
            />
            <input
              className="form-input"
              value={createForm.end_at}
              onChange={(event) => setCreateForm({ ...createForm, end_at: event.target.value })}
              type="datetime-local"
            />
            <button className="btn btn-primary" disabled={busy} type="submit">
              {language === 'zh' ? '保存挑战' : 'Save challenge'}
            </button>
          </form>
        </section>
      )}

      {error && (
        <div className="card" style={{ color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {challenges.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">{language === 'zh' ? '暂无挑战' : 'No challenges yet'}</div>
        </div>
      ) : (
        <div className="challenge-list">
          {challenges.map((challenge) => {
            const isJoined = joinedChallengeIds.has(challenge.id)
            return (
              <article key={challenge.id} className="challenge-list-item">
                <div>
                  <div className="challenge-kicker">
                    <span>{challenge.status}</span>
                    <span>{challenge.scoring_method}</span>
                    <span>{marketLabel(challenge.market, language)} {challenge.symbol || 'all'}</span>
                  </div>
                  <Link to={`/challenges/${challenge.challenge_key}`} className="challenge-list-title">
                    {challenge.title}
                  </Link>
                  <div className="challenge-list-meta">
                    <span>{language === 'zh' ? '参赛' : 'Participants'} {challenge.participant_count || 0}</span>
                    <span>{language === 'zh' ? '结束' : 'Ends'} {formatDate(challenge.end_at, language)}</span>
                    <span>{formatMoney(challenge.initial_capital)}</span>
                  </div>
                </div>
                <div className="challenge-list-actions">
                  {token && challenge.status !== 'settled' && challenge.status !== 'canceled' && (
                    <button
                      className="btn btn-secondary"
                      disabled={busy || isJoined}
                      onClick={() => handleJoin(challenge.challenge_key)}
                    >
                      {isJoined ? (language === 'zh' ? '已加入' : 'Joined') : (language === 'zh' ? '加入' : 'Join')}
                    </button>
                  )}
                  <Link className="btn btn-ghost" to={`/challenges/${challenge.challenge_key}`}>
                    {language === 'zh' ? '查看' : 'Open'}
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
