interface PlaceholderPageProps {
  title: string;
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      minHeight: 300,
      color: '#9ca3af',
      fontSize: 16,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🚧</div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Coming soon</div>
      </div>
    </div>
  );
}
