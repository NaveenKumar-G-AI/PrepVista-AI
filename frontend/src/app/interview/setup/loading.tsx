export default function Loading() {
  return (
    <div className="min-h-screen surface-primary flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 mb-4" />
        <div className="text-lg font-medium text-primary">Preparing Interview Setup...</div>
        <div className="text-sm text-secondary mt-2">Checking your camera and microphone...</div>
      </div>
    </div>
  );
}
