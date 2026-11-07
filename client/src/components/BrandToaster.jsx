import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { CircleCheck, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useSession } from '../auth/SessionProvider.jsx';
import { toast } from 'sonner';

export default function BrandToaster() {
  const session = useSession();
  useEffect(() => { toast.dismiss(); }, [session.ownerKey]);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const change = () => setMobile(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return <Toaster style={{fontFamily:'var(--tw-font-body)'}} position={mobile ? 'bottom-center' : 'bottom-right'} visibleToasts={2} closeButton duration={5000} gap={10} offset="24px" mobileOffset={{ bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))', left: 12, right: 12 }} icons={{ success: <CircleCheck size={19}/>, error: <CircleAlert size={19}/>, info: <Info size={19}/>, warning: <TriangleAlert size={19}/> }} toastOptions={{ className: 'tw-toast', classNames: { title: 'tw-toast-title', description: 'tw-toast-description', closeButton: 'tw-toast-close', actionButton: 'tw-toast-action' } }}/>
}
