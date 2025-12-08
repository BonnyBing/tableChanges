interface ToastProps {
  message: string
}

export const Toast = ({ message }: ToastProps) => {
  if (!message) return null
  
  return <div className="toast-banner">{message}</div>
}


