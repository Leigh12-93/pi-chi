function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', background: '#f5f5f5' }}>
      <h1 style={{ color: '#333' }}>Many Files Test</h1>
      <p>This project has many files, but preview should still work due to filtering.</p>
      <ul>
        <li>Test files (.test.tsx) are filtered out</li>
        <li>Documentation files are filtered out</li>
        <li>Only essential files are sent to the sandbox</li>
      </ul>
    </div>
  )
}

export default App