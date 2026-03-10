function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1 style={{ color: '#0066cc' }}>Preview Test</h1>
      <p>If you can see this, the preview system is working!</p>
      <button 
        onClick={() => alert('Button works!')} 
        style={{
          padding: '0.5rem 1rem',
          background: '#0066cc',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Test Button
      </button>
    </div>
  )
}

export default App