/** Tiny client-side session state shared across the shell. */
export function useErebusState() {
  const selectedProjectId = useState<string | null>('erebus-selected-project', () => null)
  return { selectedProjectId }
}
