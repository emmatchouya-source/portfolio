/* DroneLab reference controller, C99, SI units, local ENU world / FLU body.
 * Quaternion: Hamilton [w,x,y,z], body -> world.
 * Motor positions/order come from DL_Config.rotors (FLU metres).
 * Rotor spin is the sign of body reaction torque about +Z.
 * Outputs are NEWTONS, NOT PWM/DShot values. Requires calibrated thrust mapping.
 * No drivers, state estimator, mission manager or flight supervisor included.
 * Simulation reference only. See README.md before hardware integration.
 * Build example: cc -std=c99 -Wall -Wextra -pedantic -c controller.c
 */
#include <math.h>
#include <stdbool.h>
#include <string.h>
#define DL_MAX_MOTORS 8

typedef struct {
    double mass, arm, thrust, inertia[3], yaw_ratio;
    double pos_p, vel_p, vel_i, att_p, rate_p, rate_i, rate_d;
    double tilt_rad, speed;
    unsigned motor_count;
    double rotors[DL_MAX_MOTORS][3]; /* x, y, reaction-torque sign */
} DL_Config;
/* CONFIG_BEGIN */
static const DL_Config DL_DEFAULT = {
    1.5, .23, 9., {.022,.022,.040}, .018,
    1.3, 2.5, .35, 5., 18., 8., .12,
    .5235987755982988, 3., 4,
    {{.16263455967290594,.16263455967290594,1},{-.16263455967290594,.16263455967290594,-1},
     {-.16263455967290594,-.16263455967290594,1},{.16263455967290594,-.16263455967290594,-1}}
};
/* CONFIG_END */
typedef struct {double p[3],v[3],q[4],w[3];} DL_State;
typedef struct {double p[3],v[3],a[3],yaw;} DL_Target;
typedef struct {double iv[3],ir[3],prev[3],der[3];bool saturated;} DL_Controller;
typedef struct {double motor_N[DL_MAX_MOTORS];bool saturated;unsigned motor_count;} DL_Output;

static double dl_clip(double v,double lo,double hi){return fmax(lo,fmin(hi,v));}
static double dl_norm(const double *v,int n){double r=0;for(int i=0;i<n;i++)r+=v[i]*v[i];return sqrt(r);}
static void dl_cross(const double a[3],const double b[3],double o[3]){o[0]=a[1]*b[2]-a[2]*b[1];o[1]=a[2]*b[0]-a[0]*b[2];o[2]=a[0]*b[1]-a[1]*b[0];}
static bool dl_unit(double v[3]){double n=dl_norm(v,3);if(n<1e-12)return false;for(int i=0;i<3;i++)v[i]/=n;return true;}
static void dl_mul(const double a[4],const double b[4],double o[4]){
    o[0]=a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3];
    o[1]=a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2];
    o[2]=a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1];
    o[3]=a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0];
}
static void dl_axes(const double x[3],const double y[3],const double z[3],double q[4]){
    double m[9]={x[0],y[0],z[0],x[1],y[1],z[1],x[2],y[2],z[2]},t=m[0]+m[4]+m[8],s;
    if(t>0){s=sqrt(t+1)*2;q[0]=s/4;q[1]=(m[7]-m[5])/s;q[2]=(m[2]-m[6])/s;q[3]=(m[3]-m[1])/s;}
    else if(m[0]>m[4]&&m[0]>m[8]){s=sqrt(1+m[0]-m[4]-m[8])*2;q[0]=(m[7]-m[5])/s;q[1]=s/4;q[2]=(m[1]+m[3])/s;q[3]=(m[2]+m[6])/s;}
    else if(m[4]>m[8]){s=sqrt(1+m[4]-m[0]-m[8])*2;q[0]=(m[2]-m[6])/s;q[1]=(m[1]+m[3])/s;q[2]=s/4;q[3]=(m[5]+m[7])/s;}
    else{s=sqrt(1+m[8]-m[0]-m[4])*2;q[0]=(m[3]-m[1])/s;q[1]=(m[2]+m[6])/s;q[2]=(m[5]+m[7])/s;q[3]=s/4;}
    s=dl_norm(q,4);for(int i=0;i<4;i++)q[i]/=s;
}
void dl_reset(DL_Controller *ctl){memset(ctl,0,sizeof(*ctl));}
/* Balanced planar layouts only. Reject non-orthogonal/custom geometries.
 * Minimum-norm allocation followed by clipping; no failure reallocation.
 */
bool dl_allocate(const DL_Config *c,double total,const double torque[3],DL_Output *out){
    if(!out)return false;
    memset(out,0,sizeof(*out));
    if(!c||!torque||!isfinite(total)||!isfinite(c->yaw_ratio)||c->yaw_ratio<=0||
       !isfinite(c->thrust)||c->thrust<=0||!isfinite(c->arm)||c->arm<=0||
       (c->motor_count!=4&&c->motor_count!=6&&c->motor_count!=8))return false;
    double sx=0,sy=0,sumx=0,sumy=0,sumspin=0,xy=0,xspin=0,yspin=0;
    for(unsigned i=0;i<c->motor_count;i++){
        const double *r=c->rotors[i];
        if(!isfinite(r[0])||!isfinite(r[1])||!isfinite(r[2])||fabs(r[2])!=1||hypot(r[0],r[1])>c->arm*1.000001)return false;
        sx+=r[0]*r[0];sy+=r[1]*r[1];sumx+=r[0];sumy+=r[1];sumspin+=r[2];
        xy+=r[0]*r[1];xspin+=r[0]*r[2];yspin+=r[1]*r[2];
    }
    /* AVR double may be 32-bit: allow rounding of the balanced sums. */
    if(sx<1e-12||sy<1e-12||fabs(sumx)>1e-6||fabs(sumy)>1e-6||fabs(sumspin)>1e-6||
       fabs(xy)>1e-6||fabs(xspin)>1e-6||fabs(yspin)>1e-6)return false;
    for(unsigned j=0;j<3;j++)if(!isfinite(torque[j]))return false;
    for(unsigned i=0;i<c->motor_count;i++){
        const double *r=c->rotors[i];
        double v=total/c->motor_count+r[1]*torque[0]/sy-r[0]*torque[1]/sx+r[2]*torque[2]/(c->motor_count*c->yaw_ratio);
        if(!isfinite(v)){memset(out,0,sizeof(*out));return false;}
        if(v<0||v>c->thrust)out->saturated=true;
        out->motor_N[i]=dl_clip(v,0,c->thrust);
    }
    out->motor_count=c->motor_count;return true;
}
/* Caller provides a calibrated, timestamp-checked ESTIMATED state, not raw IMU.
 * Call nominally at 240 Hz, dt in seconds. armed=false resets and returns zeros.
 * The caller must handle invalid data, sensor loss, arming and flight failsafes.
 */
bool dl_step(DL_Controller *ctl,const DL_Config *c,const DL_State *s,
             const DL_Target *target,double dt,bool armed,DL_Output *out){
    const double g=9.80665;
    if(!out)return false;
    memset(out,0,sizeof(*out));
    if(!ctl||!c||!s||!target)return false;
    if(!armed){dl_reset(ctl);return true;}
    if(!isfinite(dt)||dt<.001||dt>.05)return false;
    double cfg[]={c->mass,c->arm,c->thrust,c->yaw_ratio,c->pos_p,c->vel_p,c->vel_i,c->att_p,c->rate_p,c->rate_i,c->rate_d,c->tilt_rad,c->speed};
    for(unsigned i=0;i<sizeof(cfg)/sizeof(cfg[0]);i++)if(!isfinite(cfg[i]))return false;
    if(c->mass<=0||c->arm<=0||c->thrust<=0||c->yaw_ratio<=0||c->speed<=0||c->tilt_rad<=0||c->tilt_rad>.785398164)return false;
    for(int i=0;i<3;i++)if(!isfinite(c->inertia[i])||c->inertia[i]<=0||!isfinite(s->p[i])||!isfinite(s->v[i])||!isfinite(s->w[i])||!isfinite(target->p[i])||!isfinite(target->v[i])||!isfinite(target->a[i]))return false;
    for(int i=0;i<4;i++)if(!isfinite(s->q[i]))return false;
    if(!isfinite(target->yaw)||fabs(dl_norm(s->q,4)-1)>.001)return false;
    double vd[3],ev[3],acc[3],f[3];
    for(int i=0;i<3;i++)vd[i]=c->pos_p*(target->p[i]-s->p[i])+target->v[i];
    double speed=dl_norm(vd,3);if(speed>c->speed)for(int i=0;i<3;i++)vd[i]*=c->speed/speed;
    for(int i=0;i<3;i++){
        ev[i]=vd[i]-s->v[i];
        if(!ctl->saturated)ctl->iv[i]=dl_clip(ctl->iv[i]+ev[i]*dt,-3,3);
        acc[i]=c->vel_p*ev[i]+c->vel_i*ctl->iv[i]+target->a[i];
    }
    acc[2]=dl_clip(acc[2],-.6*g,g);
    double h=hypot(acc[0],acc[1]),max_h=fmax(.1,g+acc[2])*tan(c->tilt_rad);
    if(h>max_h){acc[0]*=max_h/h;acc[1]*=max_h/h;}
    for(int i=0;i<3;i++)f[i]=c->mass*(acc[i]+(i==2?g:0));
    double z[3]={f[0],f[1],f[2]},xc[3]={cos(target->yaw),sin(target->yaw),0},y[3],x[3];
    if(!dl_unit(z))return false;
    dl_cross(z,xc,y);if(!dl_unit(y))return false;dl_cross(y,z,x);
    double qd[4],qe[4],qc[4]={s->q[0],-s->q[1],-s->q[2],-s->q[3]};dl_axes(x,y,z,qd);dl_mul(qc,qd,qe);
    double iw[3],gyro[3],torque[3];for(int i=0;i<3;i++)iw[i]=s->w[i]*c->inertia[i];dl_cross(s->w,iw,gyro);
    for(int i=0;i<3;i++){
        double wr=dl_clip(2*c->att_p*(qe[0]>=0?1:-1)*qe[i+1],-3,3),er=wr-s->w[i];
        ctl->der[i]+=.2*((s->w[i]-ctl->prev[i])/dt-ctl->der[i]);ctl->prev[i]=s->w[i];
        if(!ctl->saturated)ctl->ir[i]=dl_clip(ctl->ir[i]+er*dt,-.6,.6);
        torque[i]=c->inertia[i]*(c->rate_p*er+c->rate_i*ctl->ir[i]-c->rate_d*ctl->der[i])+gyro[i];
    }
    const double *q=s->q;
    double body_z[3]={2*(q[1]*q[3]+q[0]*q[2]),2*(q[2]*q[3]-q[0]*q[1]),1-2*(q[1]*q[1]+q[2]*q[2])};
    double total=0;for(int i=0;i<3;i++)total+=f[i]*body_z[i];total=dl_clip(total,0,c->motor_count*c->thrust);
    if(!dl_allocate(c,total,torque,out)){dl_reset(ctl);return false;}
    ctl->saturated=out->saturated;return true;
}
