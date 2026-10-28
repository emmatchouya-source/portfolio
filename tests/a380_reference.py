"""Independent Python/SciPy reference: polynomial Hermite path + adaptive ODE solve."""
import math
import numpy as np
from scipy.interpolate import BPoly
from scipy.integrate import solve_ivp
from scipy.optimize import brentq


def reference_mission(c,p):
    g,r=9.80665,287.05287
    def air(h):
        t=max(216.65,288.15-.0065*h)
        p11=101325*(216.65/288.15)**(g/(.0065*r))
        pressure=101325*(t/288.15)**(g/(.0065*r)) if h<=11000 else p11*math.exp(-g*(h-11000)/(r*216.65))
        return t+c['disa'],pressure
    def speed(h):return p['mach']*math.sqrt(1.4*r*air(h)[0])
    end=c['distance']*1000
    starts=p.get('climbStarts',[c['climbStart1']/100,c['climbStart2']/100][:p['steps']])
    climbs=[];breaks=[0,end]
    for i,start in enumerate(starts):
        h0=p['altitude']+i*c['stepHeight'];h1=h0+c['stepHeight']
        x0=start*end;x1=x0+1.875*c['stepHeight']*(max(speed(h0),speed(h1))+c['wind'])/c['climbRate']
        poly=BPoly.from_derivatives([x0,x1],[[h0,0,0],[h1,0,0]])
        climbs.append((x0,x1,h0,h1,poly));breaks.extend([x0,x1])
        if h0<11000<h1:breaks.append(brentq(lambda x:float(poly(x))-11000,x0,x1,xtol=1e-7))
    def path(x):
        h=p['altitude']
        for x0,x1,h0,h1,poly in climbs:
            if x>=x1:h=h1
            elif x>=x0:return float(poly(x)),float(poly.derivative()(x)),float(poly.derivative(2)(x))
            else:break
        return h,0,0
    state=np.array([c['mass'],0.])
    for x0,x1 in zip(sorted(breaks),sorted(breaks)[1:]):
        lapse=-.0065 if path((x0+x1)/2)[0]<11000 else 0
        def derivative(x,y):
            h,slope,curvature=path(x);temp,pressure=air(h);v=speed(h)
            gamma=brentq(lambda a:v*math.sin(a)-slope*(v*math.cos(a)+c['wind']),-.15,.15,xtol=1e-14)
            gs=v*math.cos(gamma)+c['wind'];roc=slope*gs
            dv_dh=lapse*v/(2*temp)
            dgamma_dx=(curvature*gs-dv_dh*slope*(math.sin(gamma)-slope*math.cos(gamma)))/(v*(math.cos(gamma)+slope*math.sin(gamma)))
            normal=y[0]*(g*math.cos(gamma)+v*dgamma_dx*gs)
            q=.5*pressure/(r*temp)*v*v;cl=normal/(q*c['area'])
            cd=c['cd0']+c['k']*cl*cl+c['waveK']*max(0,p['mach']-c['waveMach'])**4
            thrust=q*c['area']*cd+y[0]*(g*math.sin(gamma)+dv_dh*roc)
            tsfc=c['tsfc']*1e-6*math.sqrt(temp/216.65)*(1+.6*(p['mach']-.75)+2*(p['mach']-.75)**2)
            return [-thrust*tsfc/gs,1/gs]
        solution=solve_ivp(derivative,(x0,x1),state,method='DOP853',rtol=1e-12,atol=[1e-7,1e-8],max_step=(x1-x0)/20)
        assert solution.success
        state=solution.y[:,-1]
    return c['mass']-state[0],state[1]
