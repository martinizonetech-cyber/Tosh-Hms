import { createContext, useContext, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import { ApiDataContext, ApiProvider } from '../api/ApiProvider';
import { DATA_MODE } from '../repositories/mode';
import { demoRepository } from './demoRepository';

const DataContext = createContext<ReturnType<typeof useDataValue> | null>(null);

function useDataValue() {
  const state = useSyncExternalStore(demoRepository.subscribe, demoRepository.getSnapshot, demoRepository.getSnapshot);
  return useMemo(() => ({ state, repository: demoRepository, mode: DATA_MODE }), [state]);
}

export function DemoProvider({ children }: PropsWithChildren) {
  if (DATA_MODE === 'api') {
    return <ApiProvider>{children}</ApiProvider>;
  }
  return <MockDataProvider>{children}</MockDataProvider>;
}

function MockDataProvider({ children }: PropsWithChildren) {
  const value = useDataValue();
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useHospitalData() {
  if (DATA_MODE === 'api') {
    const apiContext = useContext(ApiDataContext);
    if (!apiContext) {
      throw new Error('useHospitalData requires an active ApiProvider when running in API mode.');
    }
    return apiContext;
  }

  const mockContext = useContext(DataContext);
  if (!mockContext) {
    throw new Error('useHospitalData is available only after the demo provider is active.');
  }
  return mockContext;
}
