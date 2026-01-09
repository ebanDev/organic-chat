export function useOnline() {
  const online = useState<boolean>('app-online', () => true)

  if (import.meta.client) {
    const update = () => {
      online.value = navigator.onLine
    }
    onMounted(() => {
      update()
      window.addEventListener('online', update)
      window.addEventListener('offline', update)
    })
    onBeforeUnmount(() => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    })
  }

  return { isOnline: online }
}
