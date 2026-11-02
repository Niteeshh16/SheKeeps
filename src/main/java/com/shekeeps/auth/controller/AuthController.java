package com.shekeeps.auth.controller;

import com.shekeeps.auth.service.AuthService;
import com.shekeeps.auth.dto.ApiModels.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final AuthService auth;
    @Value("${app.cookie-secure:false}") private boolean secureCookies;
    public AuthController(AuthService auth) { this.auth=auth; }

    @GetMapping("/health") public ResponseEntity<?> health() {
        boolean healthy=auth.databaseHealthy();
        return ResponseEntity.status(healthy?200:503).body(Map.of("status",healthy?"healthy":"degraded","timestamp",Instant.now().toString(),"database",healthy?"connected":"disconnected"));
    }

    @PostMapping("/auth/register") public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest body,HttpServletResponse response) {
        var result=auth.register(body); setCookies(response,result); return ResponseEntity.status(201).body(result);
    }
    @PostMapping("/auth/login") public ResponseEntity<?> login(@Valid @RequestBody LoginRequest body,HttpServletResponse response) {
        var result=auth.login(body); setCookies(response,result); return ResponseEntity.ok(result);
    }
    @PostMapping("/auth/refresh") public ResponseEntity<?> refresh(@RequestBody(required=false) TokenRequest body,HttpServletRequest request,HttpServletResponse response) {
        String token=token(body,request); var result=auth.refresh(token); setCookies(response,result); return ResponseEntity.ok(result);
    }
    @PostMapping("/auth/logout") public ResponseEntity<?> logout(@RequestBody(required=false) TokenRequest body,HttpServletRequest request,HttpServletResponse response) {
        auth.logout(token(body,request)); clearCookies(response); return ResponseEntity.ok(Map.of("status","success","message","Logged out successfully"));
    }
    @GetMapping("/auth/me") public ResponseEntity<?> me(HttpServletRequest request) {
        String token=null; String authorization=request.getHeader(HttpHeaders.AUTHORIZATION);
        if(authorization!=null && authorization.startsWith("Bearer ")) token=authorization.substring(7);
        else if(request.getCookies()!=null) for(var cookie:request.getCookies()) if(cookie.getName().equals("accessToken")){token=cookie.getValue();break;}
        return ResponseEntity.ok(Map.of("status","success","data",Map.of("user",auth.authenticate(token),"authBypass",auth.authBypassEnabled())));
    }
    private String token(TokenRequest body,HttpServletRequest request) {
        if(request.getCookies()!=null) for(var cookie:request.getCookies()) if(cookie.getName().equals("refreshToken")) return cookie.getValue();
        if(body!=null && body.refreshToken()!=null) return body.refreshToken();
        return request.getHeader("X-Refresh-Token");
    }
    @SuppressWarnings("unchecked") private void setCookies(HttpServletResponse response,Map<String,Object> payload) {
        Map<String,Object> data=(Map<String,Object>)payload.get("data"); if(data==null)return;
        cookie(response,"accessToken",(String)data.get("accessToken"),900,"/");
        cookie(response,"refreshToken",(String)data.get("refreshToken"),604800,"/api/auth");
    }
    private void clearCookies(HttpServletResponse response) { cookie(response,"accessToken","",0,"/");cookie(response,"refreshToken","",0,"/api/auth"); }
    private void cookie(HttpServletResponse response,String name,String value,int age,String path) {
        ResponseCookie c=ResponseCookie.from(name,value).httpOnly(true).secure(secureCookies).sameSite(secureCookies?"None":"Lax").path(path).maxAge(age).build();
        response.addHeader(HttpHeaders.SET_COOKIE,c.toString());
    }
}
