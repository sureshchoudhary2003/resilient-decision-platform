import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  ShieldCheck, 
  Layers, 
  History, 
  Settings2
} from 'lucide-react';
import './App.css';

const API_BASE = 'http://localhost:5000/api';

const PRESETS = [
  {
    label: 'Auto-Approve',
    name: 'Dr. Priya Sen',
    email: 'priya.sen@example.com',
    income: 150000,
    creditScore: 790,
    loanAmount: 250000,
    simulateFail: false
  },
  {
    label: 'Manual Review',
    name: 'Sunil Mehra',
    email: 'sunil.mehra@example.com',
    income: 65000,
    creditScore: 670,
    loanAmount: 180000,
    simulateFail: false
  },
  {
    label: 'Policy Reject',
    name: 'Rohan Sharma',
    email: 'rohan.sharma@example.com',
    income: 16000,
    creditScore: 710,
    loanAmount: 80000,
    simulateFail: false
  },
  {
    label: 'Simulate Outage',
    name: 'Chaos Test',
    email: 'chaos@example.com',
    income: 100000,
    creditScore: 750,
    loanAmount: 150000,
    simulateFail: true
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('decision');
  const [isOnline, setIsOnline] = useState(false);
  const [workflow, setWorkflow] = useState(null);

  const [form, setForm] = useState({
    applicantName: PRESETS[0].name,
    email: PRESETS[0].email,
    income: PRESETS[0].income,
    creditScore: PRESETS[0].creditScore,
    loanAmount: PRESETS[0].loanAmount
  });

  const [simulateFailure, setSimulateFailure] = useState(false);
  const [failAttempts, setFailAttempts] = useState(0);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);

  const [reviewNotes, setReviewNotes] = useState('');

  useEffect(() => {
    checkHealth();
    loadWorkflow();
    loadApplications();
  }, []);

  const checkHealth = async () => {
    try {
      const res = await axios.get(`${API_BASE}/health`);
      setIsOnline(res.data?.success === true);
    } catch {
      setIsOnline(false);
    }
  };

  const loadWorkflow = async () => {
    try {
      const res = await axios.get(`${API_BASE}/workflows/active`);
      if (res.data?.success) setWorkflow(res.data.data);
    } catch (e) {
      console.warn('Workflow fetch failed:', e.message);
    }
  };

  const loadApplications = async () => {
    try {
      const res = await axios.get(`${API_BASE}/applications?limit=20`);
      if (res.data?.success) {
        setApplications(res.data.data);
        if (!selectedApp && res.data.data.length > 0) {
          setSelectedApp(res.data.data[0]);
          loadAudit(res.data.data[0].applicationId);
        }
      }
    } catch (e) {
      console.warn('Applications fetch failed:', e.message);
    }
  };

  const loadAudit = async (appId) => {
    try {
      const res = await axios.get(`${API_BASE}/applications/${appId}/audit`);
      if (res.data?.success) setAuditLogs(res.data.data);
    } catch (e) {
      console.warn('Audit fetch failed:', e.message);
    }
  };

  const applyPreset = (preset) => {
    setForm({
      applicantName: preset.name,
      email: preset.email,
      income: preset.income,
      creditScore: preset.creditScore,
      loanAmount: preset.loanAmount
    });
    setSimulateFailure(preset.simulateFail);
    setError(null);
  };

  const handleEvaluate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const idempotencyKey = `KEY-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      };
      if (simulateFailure) headers['x-simulate-bureau-failure'] = 'true';
      if (failAttempts > 0) headers['x-fail-attempts'] = String(failAttempts);

      const res = await axios.post(`${API_BASE}/applications`, {
        applicantName: form.applicantName,
        email: form.email,
        income: Number(form.income),
        creditScore: Number(form.creditScore),
        loanAmount: Number(form.loanAmount)
      }, { headers });

      setResult(res.data);
      loadApplications();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Evaluation request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (appId, decision) => {
    try {
      const res = await axios.post(`${API_BASE}/applications/${appId}/review`, {
        decision,
        reviewer: 'Senior Underwriter',
        notes: reviewNotes || `Decision confirmed as ${decision}`
      });

      if (res.data?.success) {
        if (result && result.data?.applicationId === appId) {
          setResult(prev => ({
            ...prev,
            status: decision,
            decision: decision,
            data: res.data.data
          }));
        }
        if (selectedApp?.applicationId === appId) {
          setSelectedApp(res.data.data);
          loadAudit(appId);
        }
        loadApplications();
        setReviewNotes('');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Underwriter action failed');
    }
  };

  const handleRetry = async (appId) => {
    try {
      const res = await axios.post(`${API_BASE}/applications/${appId}/retry`);
      if (res.data?.success) {
        if (result?.data?.applicationId === appId) {
          setResult(prev => ({
            ...prev,
            status: res.data.data.status,
            decision: res.data.data.decision,
            data: res.data.data
          }));
        }
        loadApplications();
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Retry failed');
    }
  };

  const lti = form.income > 0 ? (Number(form.loanAmount) / Number(form.income)).toFixed(2) : '0.00';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <div className="app-logo">
            <Layers size={18} />
          </div>
          <div>
            <h1 className="app-title">Decision Platform</h1>
            <p className="app-tagline">Resilient Workflow & Decision Engine</p>
          </div>
        </div>

        <div className="header-right">
          <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            <span>{isOnline ? 'Server Active (Port 5000)' : 'Server Offline'}</span>
          </div>
          {workflow && (
            <span className="workflow-pill">
              {workflow.name} <strong>v{workflow.version}</strong>
            </span>
          )}
        </div>
      </header>

      <nav className="tab-bar">
        <button 
          className={`tab-item ${activeTab === 'decision' ? 'active' : ''}`}
          onClick={() => setActiveTab('decision')}
        >
          <Layers size={16} /> Decision Studio
        </button>
        <button 
          className={`tab-item ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => { setActiveTab('audit'); loadApplications(); }}
        >
          <History size={16} /> Audit Trail ({applications.length})
        </button>
        <button 
          className={`tab-item ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => { setActiveTab('config'); loadWorkflow(); }}
        >
          <Settings2 size={16} /> Rule Registry
        </button>
      </nav>

      {activeTab === 'decision' && (
        <div className="content-grid">
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Application Intake</h2>
              <span className={`ratio-badge ${Number(lti) > 5 ? 'ratio-warn' : 'ratio-ok'}`}>
                LTI: {lti}x {Number(lti) > 5 ? '(Review)' : '(Safe)'}
              </span>
            </div>

            <div className="preset-group">
              <span className="preset-label">Quick Presets:</span>
              <div className="preset-buttons">
                {PRESETS.map((p, i) => (
                  <button 
                    key={i} 
                    type="button" 
                    className={`btn-preset ${form.applicantName === p.name ? 'btn-preset-active' : ''}`}
                    onClick={() => applyPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleEvaluate} className="form-stack">
              <div className="form-control">
                <label>Applicant Full Name</label>
                <input 
                  type="text" 
                  value={form.applicantName} 
                  onChange={e => setForm({ ...form, applicantName: e.target.value })}
                  required
                />
              </div>

              <div className="form-control">
                <label>Email Address</label>
                <input 
                  type="email" 
                  value={form.email} 
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-control">
                  <label>Annual Income (₹ / $)</label>
                  <input 
                    type="number" 
                    value={form.income} 
                    onChange={e => setForm({ ...form, income: e.target.value })}
                    required
                  />
                </div>
                <div className="form-control">
                  <label>Credit Score (300–850)</label>
                  <input 
                    type="number" 
                    value={form.creditScore} 
                    onChange={e => setForm({ ...form, creditScore: e.target.value })}
                    required
                    min={300}
                    max={850}
                  />
                </div>
              </div>

              <div className="form-control">
                <label>Requested Loan Amount (₹ / $)</label>
                <input 
                  type="number" 
                  value={form.loanAmount} 
                  onChange={e => setForm({ ...form, loanAmount: e.target.value })}
                  required
                />
              </div>

              <div className="resilience-box">
                <label className="checkbox-control">
                  <input 
                    type="checkbox" 
                    checked={simulateFailure}
                    onChange={e => setSimulateFailure(e.target.checked)}
                  />
                  <span>Simulate External Bureau Outage (503 Error)</span>
                </label>

                <div className="retry-select-row">
                  <span>Fail first attempts (Retry test):</span>
                  <select 
                    value={failAttempts} 
                    onChange={e => setFailAttempts(Number(e.target.value))}
                  >
                    <option value={0}>0 (Clean Execution)</option>
                    <option value={1}>1 Attempt (Recovers on Retry 2)</option>
                    <option value={2}>2 Attempts (Recovers on Retry 3)</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Evaluating Pipeline...' : 'Run Decision Engine'}
              </button>
            </form>

            {error && (
              <div className="banner banner-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Evaluation Outcome</h2>
            </div>

            {!result && !loading && (
              <div className="empty-state">
                <ShieldCheck size={36} className="empty-icon" />
                <p>Fill out the application or choose a preset to evaluate rules.</p>
              </div>
            )}

            {loading && (
              <div className="empty-state">
                <RefreshCw size={28} className="spinner" />
                <p>Running rules evaluation and bureau enrichment...</p>
              </div>
            )}

            {result && (
              <div className="result-stack">
                <div className={`status-hero status-${result.status?.toLowerCase()}`}>
                  <div className="status-hero-left">
                    <span className="status-label">Decision Result</span>
                    <span className="status-value">{result.decision || result.status}</span>
                  </div>
                  <span className={`pill-badge badge-${result.status?.toLowerCase()}`}>
                    {result.status === 'APPROVED' && <CheckCircle2 size={14} />}
                    {result.status === 'REJECTED' && <XCircle size={14} />}
                    {result.status === 'MANUAL_REVIEW' && <AlertCircle size={14} />}
                    {result.status === 'FAILED' && <RefreshCw size={14} />}
                    {result.status}
                  </span>
                </div>

                <div className="reason-card">
                  <strong>Reasoning:</strong> {result.decisionReason || result.data?.decisionReason}
                </div>

                {result.enrichmentData && (
                  <div className="telemetry-bar">
                    <div className="telemetry-cell">
                      <span className="tel-title">Bureau Ref</span>
                      <span className="tel-data">{result.enrichmentData.bureauReferenceId}</span>
                    </div>
                    <div className="telemetry-cell">
                      <span className="tel-title">Verified Score</span>
                      <span className="tel-data">{result.enrichmentData.verifiedCreditScore}</span>
                    </div>
                    <div className="telemetry-cell">
                      <span className="tel-title">Fraud Risk</span>
                      <span className={`tel-data ${result.enrichmentData.fraudRiskScore > 50 ? 'text-danger' : 'text-ok'}`}>
                        {result.enrichmentData.fraudRiskScore} / 100
                      </span>
                    </div>
                    <div className="telemetry-cell">
                      <span className="tel-title">Active Defaults</span>
                      <span className={`tel-data ${result.enrichmentData.activeDefaults > 0 ? 'text-danger' : 'text-ok'}`}>
                        {result.enrichmentData.activeDefaults}
                      </span>
                    </div>
                  </div>
                )}

                {result.status === 'MANUAL_REVIEW' && (
                  <div className="action-station">
                    <h3>Underwriter Review Action</h3>
                    <p>This case requires secondary approval before proceeding.</p>
                    <input 
                      type="text" 
                      placeholder="Enter underwriter notes (optional)..."
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                      className="input-review"
                    />
                    <div className="btn-row">
                      <button 
                        className="btn-action btn-approve"
                        onClick={() => handleReview(result.data.applicationId, 'APPROVED')}
                      >
                        Approve Exception
                      </button>
                      <button 
                        className="btn-action btn-reject"
                        onClick={() => handleReview(result.data.applicationId, 'REJECTED')}
                      >
                        Decline Application
                      </button>
                    </div>
                  </div>
                )}

                {result.status === 'FAILED' && (
                  <div className="action-station action-retry">
                    <h3>External Service Outage</h3>
                    <p>The external bureau failed after retry attempts.</p>
                    <button 
                      className="btn-action btn-retry"
                      onClick={() => handleRetry(result.data.applicationId)}
                    >
                      Retry Pipeline Execution
                    </button>
                  </div>
                )}

                <div className="table-container">
                  <h3 className="section-heading">Rule Evaluation Matrix ({result.ruleTrace?.length || 0})</h3>
                  <div className="table-scroll">
                    <table className="clean-table">
                      <thead>
                        <tr>
                          <th>Rule</th>
                          <th>Category</th>
                          <th>Target</th>
                          <th>Actual</th>
                          <th>Result</th>
                          <th>Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(result.ruleTrace || []).map((t, idx) => (
                          <tr key={idx} className={t.passed ? 'row-pass' : 'row-fail'}>
                            <td>
                              <strong>{t.ruleName}</strong>
                              <div className="table-subtext">{t.reason}</div>
                            </td>
                            <td><span className="tag-cat">{t.category}</span></td>
                            <td><code>{t.operator} {JSON.stringify(t.expectedValue)}</code></td>
                            <td>{String(t.actualValue)}</td>
                            <td>
                              <span className={`pill-result ${t.passed ? 'res-pass' : 'res-fail'}`}>
                                {t.passed ? 'PASS' : 'FAIL'}
                              </span>
                            </td>
                            <td><span className="tag-outcome">{t.outcome}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="content-grid">
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Applications ({applications.length})</h2>
            </div>
            <div className="app-feed">
              {applications.map(app => (
                <div 
                  key={app.applicationId}
                  className={`feed-card ${selectedApp?.applicationId === app.applicationId ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedApp(app);
                    loadAudit(app.applicationId);
                  }}
                >
                  <div className="feed-card-header">
                    <strong>{app.applicantName}</strong>
                    <span className={`pill-badge badge-${app.status?.toLowerCase()}`}>{app.status}</span>
                  </div>
                  <div className="feed-card-footer">
                    <span>{app.applicationId.substring(0, 16)}...</span>
                    <span>₹{Number(app.loanAmount).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">State Transitions & Audit Trail</h2>
            </div>

            {selectedApp ? (
              <div>
                <div className="selected-meta">
                  <h3>{selectedApp.applicantName}</h3>
                  <p>{selectedApp.applicationId} • {selectedApp.email}</p>
                </div>

                <h4 className="section-heading">Lifecycle State Transitions</h4>
                <div className="timeline-flow">
                  {(selectedApp.stateHistory || []).map((h, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-indicator" />
                      <div className="timeline-body">
                        <div className="timeline-head">
                          <strong>{h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.status}</strong>
                          <span className="timeline-time">{new Date(h.changedAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="timeline-reason">{h.reason}</p>
                        <span className="timeline-actor">Actor: {h.performedBy || 'system'}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <h4 className="section-heading">Audit Log Events ({auditLogs.length})</h4>
                <div className="audit-feed">
                  {auditLogs.map((log, idx) => (
                    <div key={idx} className="audit-card">
                      <div className="audit-card-top">
                        <span className="audit-event">{log.event}</span>
                        <span className="audit-time">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <pre className="audit-json">{JSON.stringify(log.details, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>Select an application on the left to view full audit logs.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'config' && (
        <section className="card full-width">
          <div className="card-header">
            <h2 className="card-title">Configured Decision Rules</h2>
            {workflow && <span className="tag-workflow">{workflow.name} (v{workflow.version})</span>}
          </div>

          {workflow && (
            <div className="table-scroll">
              <table className="clean-table">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Rule Name</th>
                    <th>Category</th>
                    <th>Field</th>
                    <th>Condition</th>
                    <th>Outcome</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(workflow.rules || []).map((r, idx) => (
                    <tr key={idx}>
                      <td>#{r.priority}</td>
                      <td><strong>{r.name}</strong></td>
                      <td><span className="tag-cat">{r.category}</span></td>
                      <td><code>{r.field}</code></td>
                      <td><code>{r.operator} {JSON.stringify(r.value)}</code></td>
                      <td><span className="tag-outcome">{r.outcome}</span></td>
                      <td><span className="pill-result res-pass">Active</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
