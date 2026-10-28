"""Geometries from the same bundled catalogue used by the browser.
No geometry, motor array or source code supplied by the client is trusted.
"""
import math

def geometry(c,frames):
    profile=frames.get(c.get('airframe','quad-x'))
    if not profile:raise ValueError('Géométrie de drone non prise en charge par cet agent.')
    aspect=c.get('hAspect',1.5)
    if isinstance(aspect,bool) or not isinstance(aspect,(int,float)) or not math.isfinite(aspect) or not 1<=aspect<=3:
        raise ValueError('Rapport longueur/largeur H invalide (1 à 3).')
    den=math.hypot(aspect,1)
    rotors=[{'x':c['arm']*x*(aspect/den if profile['layout']=='h' else 1),
             'y':c['arm']*y*(1/den if profile['layout']=='h' else 1),'spin':profile['spins'][i]}
            for i,(x,y) in enumerate(profile['positions'])]
    return {'airframe':profile['id'],'axes':'FLU','motor_count':len(rotors),'rotors':rotors}

def controller_initial(c,g):
    f=lambda value:format(value,'.16g')
    rotors=', '.join('{'+', '.join(f(r[k]) for k in ['x','y','spin'])+'}' for r in g['rotors'])
    return ('static const DL_Config DL_DEFAULT = {\n    '+', '.join(f(c[k]) for k in ['mass','arm','thrust'])+
        ', {'+', '.join(map(f,c['inertia']))+'}, '+f(c['yawRatio'])+',\n    '+
        ', '.join(f(c[k]) for k in ['posP','velP','velI','attP','rateP','rateI','rateD'])+',\n    '+
        f(c['tilt']*math.pi/180)+', '+f(c['speed'])+', '+str(g['motor_count'])+',\n    {'+rotors+'}\n};')
